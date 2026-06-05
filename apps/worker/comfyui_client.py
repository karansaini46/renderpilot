"""
ComfyUI local client for RenderPilot laptop workers.

Handles all communication with a locally-running ComfyUI server:
  - Health checking and connectivity validation
  - Loading workflow JSON templates from disk
  - Injecting render parameters (image paths, prompts, seeds, etc.)
  - Submitting workflows via the ComfyUI REST API
  - Monitoring execution progress via WebSocket
  - Collecting generated output image file paths
"""

import os
import sys
import json
import uuid
import time
import glob
import requests
import websocket
from pathlib import Path
from urllib.parse import urlparse


class ComfyUIConnectionError(Exception):
    """Raised when ComfyUI server is unreachable or not responding."""
    pass


class ComfyUIExecutionError(Exception):
    """Raised when a ComfyUI workflow execution fails."""
    pass


class ComfyUIClient:
    """
    Client interface for a locally-running ComfyUI instance.

    All network calls target localhost only. No external paid APIs are used.
    """

    HEALTH_TIMEOUT = 5       # seconds to wait for health check response
    POLL_INTERVAL = 1.0      # seconds between execution status polls
    MAX_WAIT_TIME = 600      # maximum seconds to wait for a single workflow

    def __init__(self, base_url: str, workflows_dir: str | None = None):
        """
        Args:
            base_url: The ComfyUI server URL (e.g. http://127.0.0.1:8188)
            workflows_dir: Path to the directory containing workflow JSON templates.
                           Defaults to ./workflows/ relative to this file.
        """
        self.base_url = base_url.rstrip('/')
        self.client_id = str(uuid.uuid4())

        if workflows_dir:
            self.workflows_dir = Path(workflows_dir)
        else:
            self.workflows_dir = Path(__file__).parent / 'workflows'

        # Derive WebSocket URL from the HTTP base URL
        parsed = urlparse(self.base_url)
        ws_scheme = 'wss' if parsed.scheme == 'https' else 'ws'
        ws_host = parsed.hostname or '127.0.0.1'
        ws_port = parsed.port or 8188
        self.ws_url = f"{ws_scheme}://{ws_host}:{ws_port}/ws?clientId={self.client_id}"

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    def check_health(self) -> dict:
        """
        Verifies that ComfyUI is running and responsive.

        Returns a dict with system stats if healthy.
        Raises ComfyUIConnectionError with a clear diagnostic message if not.
        """
        try:
            resp = requests.get(
                f"{self.base_url}/system_stats",
                timeout=self.HEALTH_TIMEOUT,
            )
            resp.raise_for_status()
            stats = resp.json()

            # Also verify the prompt queue is accessible
            queue_resp = requests.get(
                f"{self.base_url}/queue",
                timeout=self.HEALTH_TIMEOUT,
            )
            queue_resp.raise_for_status()

            return stats
        except requests.exceptions.ConnectionError:
            raise ComfyUIConnectionError(
                f"[ComfyUI Offline] Cannot connect to ComfyUI at {self.base_url}. "
                f"Please ensure ComfyUI is running locally. "
                f"Start it with: python main.py --listen 127.0.0.1 --port 8188"
            )
        except requests.exceptions.Timeout:
            raise ComfyUIConnectionError(
                f"[ComfyUI Timeout] ComfyUI at {self.base_url} did not respond within "
                f"{self.HEALTH_TIMEOUT}s. The server may be overloaded or starting up."
            )
        except requests.exceptions.HTTPError as e:
            raise ComfyUIConnectionError(
                f"[ComfyUI Error] ComfyUI returned HTTP {e.response.status_code}. "
                f"The server may be in an error state. Response: {e.response.text[:200]}"
            )
        except Exception as e:
            raise ComfyUIConnectionError(
                f"[ComfyUI Error] Unexpected error checking ComfyUI health: {e}"
            )

    def check_controlnet_available(self, model_name: str) -> bool:
        """
        Queries ComfyUI to check if a specific ControlNet model is available.
        """
        try:
            resp = requests.get(f"{self.base_url}/object_info/ControlNetLoader", timeout=5)
            if resp.ok:
                data = resp.json()
                models = data.get("ControlNetLoader", {}).get("input", {}).get("required", {}).get("control_net_name", [])[0]
                if models and model_name in models:
                    return True
            return False
        except Exception:
            return False

    def is_healthy(self) -> bool:
        """Returns True if ComfyUI is reachable and responsive, False otherwise."""
        try:
            self.check_health()
            return True
        except ComfyUIConnectionError:
            return False

    # ------------------------------------------------------------------
    # Workflow template loading
    # ------------------------------------------------------------------

    def list_workflows(self) -> list[str]:
        """Returns a list of available workflow template names (without .json extension)."""
        if not self.workflows_dir.exists():
            return []
        return [
            f.stem for f in self.workflows_dir.glob('*.json')
            if f.is_file()
        ]

    def load_workflow(self, template_name: str) -> dict:
        """
        Loads a workflow JSON template from the workflows directory.

        Args:
            template_name: Name of the template (with or without .json extension)

        Returns:
            The parsed workflow dict.

        Raises:
            FileNotFoundError if the template doesn't exist.
        """
        if not template_name.endswith('.json'):
            template_name = f"{template_name}.json"

        template_path = self.workflows_dir / template_name

        if not template_path.exists():
            available = self.list_workflows()
            available_str = ', '.join(available) if available else 'none found'
            raise FileNotFoundError(
                f"[Workflow Error] Template '{template_name}' not found at "
                f"{template_path}. Available templates: {available_str}"
            )

        with open(template_path, 'r', encoding='utf-8') as f:
            workflow = json.load(f)

        return workflow

    # ------------------------------------------------------------------
    # Parameter injection
    # ------------------------------------------------------------------

    def inject_parameters(
        self,
        workflow: dict,
        input_image: str | None = None,
        prompt: str = '',
        negative_prompt: str = '',
        seed: int = 42,
        output_folder: str = '',
        width: int = 512,
        height: int = 512,
        steps: int = 20,
        cfg_scale: float = 8.0,
        denoise: float | None = None,
        geometry_lock_mode: str = 'accurate',
        control_image: str | None = "NOT_PROVIDED",
        depth_control_image: str | None = "NOT_PROVIDED",
        prompt_brain_provider: str = 'unknown',
        edge_control_strength: float | None = None,
        depth_control_strength: float | None = None,
    ) -> dict:
        """
        Injects render parameters into a workflow template by scanning
        for known node class types and updating their inputs.

        This approach is resilient to different node IDs across templates
        because it matches by class_type rather than hard-coded node IDs.

        Args:
            workflow: The workflow dict (will be modified in place).
            input_image: Absolute path to the input image file.
            prompt: Positive prompt text.
            negative_prompt: Negative prompt text.
            seed: Random seed for reproducibility.
            output_folder: Directory for output files.
            width: Output image width (capped by capacity guardrails).
            height: Output image height (capped by capacity guardrails).
            steps: Number of sampling steps.
            cfg_scale: Classifier-free guidance scale.
            denoise: Denoising strength (1.0 = full generation).
            geometry_lock_mode: Geometry lock mode (creative, balanced, accurate, technical).

        Returns:
            The modified workflow dict.
        """
        # Map geometry lock mode to ComfyUI variables
        # Dual ControlNet strength profiles: (depth_strength, canny_strength)
        mode = (geometry_lock_mode or 'accurate').lower()

        control_strength_map = {
            'creative': 0.40,
            'balanced': 0.60,
            'accurate': 0.75,
            'technical': 0.92,
            # Legacy fallbacks:
            'creative_concept': 0.35,
            'balanced_enhancement': 0.55,
            'strict_structure': 0.90,
            'faithful': 0.90
        }

        canny_strength_map = {
            'creative': 0.20,
            'balanced': 0.35,
            'accurate': 0.45,
            'technical': 0.60,
            # Legacy fallbacks:
            'creative_concept': 0.25,
            'balanced_enhancement': 0.38,
            'strict_structure': 0.60,
            'faithful': 0.60
        }

        mode_depth_strength = control_strength_map.get(mode, 0.75)
        mode_canny_strength = canny_strength_map.get(mode, 0.45)
        
        generic_strength_map = {
            'creative': 0.40,
            'creative_concept': 0.40,
            'balanced': 0.70,
            'balanced_enhancement': 0.75,
            'accurate': 0.90,
            'technical': 1.0,
            'strict_structure': 1.0,
            'faithful': 1.0
        }
        control_strength = generic_strength_map.get(mode, 0.90)

        prompt_constraint = ""
        if mode == 'strict_structure':
            prompt_constraint = "photorealistic architectural render optimization, realistic materials, natural lighting, accurate shadows, glass reflections, realistic texture detail, professional archviz polish, same building geometry, same camera composition"
        elif mode == 'balanced_enhancement':
            prompt_constraint = "preserves composition, balanced style changes"
        elif mode == 'creative_concept':
            prompt_constraint = "more visual freedom, creative details, concept rendering"
        elif mode == 'creative':
            prompt_constraint = "more visual freedom, creative details"
        elif mode == 'balanced':
            prompt_constraint = "preserves composition, balanced style changes"
        elif mode == 'accurate':
            prompt_constraint = "strict composition preservation, realistic structure, client-ready layout"
        elif mode in ('technical', 'faithful'):
            prompt_constraint = "strongest preservation of contours, exact geometry, technical blueprint match"
        else:
            prompt_constraint = "photorealistic architectural render optimization, realistic materials, natural lighting, accurate shadows, glass reflections, realistic texture detail, professional archviz polish, same building geometry, same camera composition"

        # Resolve edge and depth control strengths from per-mode defaults
        final_edge_strength = edge_control_strength if edge_control_strength is not None else mode_canny_strength
        final_depth_strength = depth_control_strength if depth_control_strength is not None else mode_depth_strength

        mapped_denoise = denoise
        if mapped_denoise is None:
            if mode in ("creative_concept", "creative"):
                mapped_denoise = 0.65
            elif mode in ("balanced_enhancement", "balanced"):
                mapped_denoise = 0.40
            else:
                mapped_denoise = 0.25

        # Log final parameters
        print(f"[ComfyUI Client] Final parameters: denoise={mapped_denoise}, geometryLockMode={mode}, control_strength={control_strength}, edge_strength={final_edge_strength}, depth_strength={final_depth_strength}, promptBrainProvider={prompt_brain_provider}")

        # Resolve inputs
        resolved_control_image = input_image if control_image == "NOT_PROVIDED" else control_image
        resolved_depth_control_image = input_image if depth_control_image == "NOT_PROVIDED" else depth_control_image

        # Check ControlNet model availability (both depth and canny) and presence of images
        canny_ok = self.check_controlnet_available("control_v11p_sd15_canny.pth")
        depth_ok = self.check_controlnet_available("control_v11f1p_sd15_depth.pth")

        has_depth = depth_ok and (resolved_depth_control_image is not None)
        has_canny = canny_ok and (resolved_control_image is not None)

        if not has_depth or not has_canny:
            if not has_depth and not has_canny:
                print("[ControlNet] WARNING: Both ControlNet models are missing/disabled. Skipping ControlNet entirely.", file=sys.stderr)
                for nid in ["10", "11", "12", "13", "14", "15"]:
                    if nid in workflow:
                        del workflow[nid]
                for node in workflow.values():
                    if node.get("class_type") in ("KSampler", "KSamplerAdvanced"):
                        inputs = node.get("inputs", {})
                        if 'positive' in inputs:
                            inputs['positive'] = ["6", 0]
                        if 'negative' in inputs:
                            inputs['negative'] = ["7", 0]
            elif not has_depth:
                print("[ControlNet] WARNING: Depth ControlNet is missing/disabled. Skipping depth map control.", file=sys.stderr)
                for nid in ["10", "11", "12"]:
                    if nid in workflow:
                        del workflow[nid]
                if "15" in workflow:
                    workflow["15"]["inputs"]["conditioning"] = ["6", 0]
            elif not has_canny:
                print("[ControlNet] WARNING: Canny ControlNet is missing/disabled. Skipping canny edge control.", file=sys.stderr)
                for nid in ["13", "14", "15"]:
                    if nid in workflow:
                        del workflow[nid]
                for node in workflow.values():
                    if node.get("class_type") in ("KSampler", "KSamplerAdvanced"):
                        inputs = node.get("inputs", {})
                        if 'positive' in inputs:
                            inputs['positive'] = ["12", 0]

        for node_id, node in list(workflow.items()):
            class_type = node.get('class_type', '')
            inputs = node.get('inputs', {})

            # KSampler and KSamplerAdvanced nodes — inject seed, steps, cfg, denoise
            if class_type in ('KSampler', 'KSamplerAdvanced'):
                if 'seed' in inputs:
                    inputs['seed'] = seed
                if 'steps' in inputs:
                    inputs['steps'] = steps
                inputs['cfg'] = cfg_scale if cfg_scale is not None else 8.0
                inputs['sampler_name'] = "dpmpp_2m"
                inputs['scheduler'] = "karras"
                if 'denoise' in inputs:
                    inputs['denoise'] = mapped_denoise

            # ControlNet apply nodes — inject control strength
            if class_type in ('ControlNetApply', 'ControlNetApplyAdvanced'):
                if 'strength' in inputs:
                    meta_title = node.get('_meta', {}).get('title', '').lower()
                    if 'canny' in meta_title or 'edge' in meta_title:
                        inputs['strength'] = final_edge_strength
                    elif 'depth' in meta_title:
                        inputs['strength'] = final_depth_strength
                    else:
                        inputs['strength'] = control_strength

            # ControlNetLoader node — preserve existing model name (depth vs canny)
            # Each loader already has the correct model name from the workflow template;
            # do not overwrite since we now have two distinct ControlNet models.
            if class_type == 'ControlNetLoader':
                pass  # Model names are set in the workflow JSON template

            # CLIP Text Encode nodes — inject prompts with constraints
            # Convention: node title or _meta.title containing "negative" gets negative prompt
            if class_type == 'CLIPTextEncode':
                meta_title = node.get('_meta', {}).get('title', '').lower()
                if 'negative' in meta_title or 'neg' in meta_title:
                    if 'text' in inputs:
                        inputs['text'] = negative_prompt
                else:
                    if 'text' in inputs:
                        final_prompt = prompt
                        if prompt_constraint:
                            final_prompt = f"{prompt}, {prompt_constraint}"
                        inputs['text'] = final_prompt

            # Empty Latent Image — inject dimensions
            if class_type == 'EmptyLatentImage':
                if 'width' in inputs:
                    inputs['width'] = width
                if 'height' in inputs:
                    inputs['height'] = height

            # Load Image node — inject input image path, canny control, and depth control
            if class_type == 'LoadImage':
                meta_title = node.get('_meta', {}).get('title', '').lower()
                if 'image' in inputs:
                    if 'depth' in meta_title:
                        inputs['image'] = resolved_depth_control_image or input_image
                    elif 'control' in meta_title or 'canny' in meta_title or 'edge' in meta_title:
                        inputs['image'] = resolved_control_image or input_image
                    else:
                        inputs['image'] = input_image

            # CheckpointLoaderSimple — select model name
            if class_type == 'CheckpointLoaderSimple':
                if 'ckpt_name' in inputs:
                    current_model = inputs['ckpt_name']
                    try:
                        resp = requests.get(f"{self.base_url}/object_info/CheckpointLoaderSimple", timeout=3)
                        if resp.ok:
                            models = resp.json().get('CheckpointLoaderSimple', {}).get('input', {}).get('required', {}).get('ckpt_name', [])[0]
                            if models:
                                if current_model not in models:
                                    fallback = models[0]
                                    print(f"[{self.base_url}] Model '{current_model}' not found in ComfyUI list. Fallback to '{fallback}'.", file=sys.stderr)
                                    inputs['ckpt_name'] = fallback
                    except Exception as e:
                        print(f"[{self.base_url}] Warning: Failed to query available models: {e}", file=sys.stderr)

            # Save Image / Preview Image — inject output prefix
            if class_type in ('SaveImage', 'PreviewImage'):
                if 'filename_prefix' in inputs and output_folder:
                    inputs['filename_prefix'] = output_folder

        # Attempt to upgrade VAEDecode → VAETilingDecode for OOM protection on 4GB VRAM
        try:
            resp = requests.get(f"{self.base_url}/object_info/VAETilingDecode", timeout=3)
            if resp.ok and 'VAETilingDecode' in resp.json():
                for node_id, node in workflow.items():
                    if node.get('class_type') == 'VAEDecode':
                        node['class_type'] = 'VAETilingDecode'
                        node.setdefault('_meta', {})['title'] = 'VAE Tiling Decode'
                        print("[ComfyUI Client] Upgraded VAEDecode -> VAETilingDecode (OOM protection for 4GB VRAM)")
        except Exception:
            pass  # VAETilingDecode not available, keep VAEDecode

        return workflow

    def upload_image(self, local_path: str) -> str:
        """
        Uploads a local image file to ComfyUI's input directory.

        Args:
            local_path: Absolute path to the local image file.

        Returns:
            The filename of the uploaded image inside ComfyUI's input directory.
        """
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"Local image file not found: {local_path}")

        try:
            with open(local_path, 'rb') as f:
                filename = os.path.basename(local_path)
                files = {'image': (filename, f, 'image/png')}
                resp = requests.post(
                    f"{self.base_url}/upload/image",
                    files=files,
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()
                return data['name']
        except Exception as e:
            raise ComfyUIConnectionError(f"Failed to upload image to ComfyUI: {e}")

    # ------------------------------------------------------------------
    # Workflow submission and execution
    # ------------------------------------------------------------------

    def submit_workflow(self, workflow: dict) -> str:
        """
        Submits a workflow to ComfyUI for execution.

        Args:
            workflow: The fully-configured workflow dict.

        Returns:
            The prompt_id string for tracking execution.

        Raises:
            ComfyUIConnectionError if the server is unreachable.
            ComfyUIExecutionError if the submission is rejected.
        """
        payload = {
            'prompt': workflow,
            'client_id': self.client_id,
        }

        try:
            resp = requests.post(
                f"{self.base_url}/prompt",
                json=payload,
                timeout=10,
            )
        except requests.exceptions.ConnectionError:
            raise ComfyUIConnectionError(
                f"[ComfyUI Offline] Cannot submit workflow — ComfyUI at {self.base_url} "
                f"is not responding. Please verify the server is running."
            )
        except requests.exceptions.Timeout:
            raise ComfyUIConnectionError(
                f"[ComfyUI Timeout] Workflow submission timed out. "
                f"ComfyUI may be overloaded."
            )

        if resp.status_code != 200:
            error_detail = resp.text[:500]
            raise ComfyUIExecutionError(
                f"[ComfyUI Rejected] Workflow submission failed with HTTP {resp.status_code}. "
                f"Details: {error_detail}"
            )

        result = resp.json()
        prompt_id = result.get('prompt_id')

        if not prompt_id:
            raise ComfyUIExecutionError(
                f"[ComfyUI Error] No prompt_id returned from submission. "
                f"Response: {json.dumps(result)[:300]}"
            )

        return prompt_id

    def wait_for_completion(self, prompt_id: str, on_progress=None) -> dict:
        """
        Waits for a submitted workflow to complete using WebSocket monitoring.

        Falls back to REST polling if WebSocket connection fails.

        Args:
            prompt_id: The prompt_id returned from submit_workflow().
            on_progress: Optional callback(current_step, total_steps) for progress updates.

        Returns:
            Dict with execution results including output node data.

        Raises:
            ComfyUIExecutionError if execution fails or times out.
        """
        try:
            return self._wait_via_websocket(prompt_id, on_progress)
        except Exception as ws_err:
            print(
                f"  WebSocket monitoring failed ({ws_err}), falling back to REST polling...",
                file=sys.stderr,
            )
            return self._wait_via_polling(prompt_id)

    def _wait_via_websocket(self, prompt_id: str, on_progress=None) -> dict:
        """Monitors execution progress via ComfyUI's WebSocket API."""
        ws = websocket.WebSocket()
        ws.settimeout(5)

        try:
            ws.connect(self.ws_url)
        except Exception as e:
            raise ComfyUIConnectionError(
                f"[WebSocket Error] Cannot connect to ComfyUI WebSocket at {self.ws_url}: {e}"
            )

        start_time = time.time()
        try:
            while True:
                elapsed = time.time() - start_time
                if elapsed > self.MAX_WAIT_TIME:
                    raise ComfyUIExecutionError(
                        f"[ComfyUI Timeout] Workflow execution exceeded {self.MAX_WAIT_TIME}s limit."
                    )

                try:
                    raw = ws.recv()
                    if not raw:
                        continue

                    # Binary frames are preview images — skip them
                    if isinstance(raw, bytes):
                        continue

                    msg = json.loads(raw)
                    msg_type = msg.get('type', '')
                    data = msg.get('data', {})

                    # Progress updates
                    if msg_type == 'progress' and data.get('prompt_id') == prompt_id:
                        current = data.get('value', 0)
                        total = data.get('max', 0)
                        if on_progress and total > 0:
                            on_progress(current, total)

                    # Execution complete
                    if msg_type == 'executed' and data.get('prompt_id') == prompt_id:
                        # History may not be immediately available — retry briefly
                        for _retry in range(5):
                            result = self._fetch_history(prompt_id)
                            if result is not None:
                                return result
                            time.sleep(0.5)
                        # Fall through to polling if history still not ready
                        return self._wait_via_polling(prompt_id)

                    # Execution error
                    if msg_type == 'execution_error' and data.get('prompt_id') == prompt_id:
                        error_msg = data.get('exception_message', 'Unknown execution error')
                        node_id = data.get('node_id', 'unknown')
                        raise ComfyUIExecutionError(
                            f"[ComfyUI Error] Workflow failed at node {node_id}: {error_msg}"
                        )

                    # Queue status — check if our prompt was removed (completed/errored)
                    if msg_type == 'status':
                        status_data = data.get('status') or {}
                        queue = status_data.get('exec_info') or {}
                        pending = queue.get('queue_remaining', -1)
                        if pending == 0:
                            # Queue is empty, check history to see if our job finished
                            history = self._fetch_history(prompt_id)
                            if history:
                                return history

                except websocket.WebSocketTimeoutException:
                    # Timeout on recv is normal during idle periods
                    continue

        finally:
            try:
                ws.close()
            except Exception:
                pass

    def _wait_via_polling(self, prompt_id: str) -> dict:
        """Fallback: polls the /history endpoint until execution completes."""
        start_time = time.time()

        while True:
            elapsed = time.time() - start_time
            if elapsed > self.MAX_WAIT_TIME:
                raise ComfyUIExecutionError(
                    f"[ComfyUI Timeout] Workflow execution exceeded {self.MAX_WAIT_TIME}s limit."
                )

            history = self._fetch_history(prompt_id)
            if history:
                return history

            time.sleep(self.POLL_INTERVAL)

    def _fetch_history(self, prompt_id: str) -> dict | None:
        """
        Fetches execution history for a specific prompt_id.
        Returns the history dict if completed, None if still running.
        """
        try:
            resp = requests.get(
                f"{self.base_url}/history/{prompt_id}",
                timeout=5,
            )
            resp.raise_for_status()
            history = resp.json()

            if prompt_id in history:
                return history[prompt_id]

        except Exception:
            pass

        return None

    # ------------------------------------------------------------------
    # Output collection
    # ------------------------------------------------------------------

    def collect_outputs(self, history: dict, comfyui_output_dir: str | None = None) -> list[str]:
        """
        Extracts generated image file paths from execution history.

        Args:
            history: The execution history dict returned by wait_for_completion().
            comfyui_output_dir: The ComfyUI output directory path. If not provided,
                                attempts to use the default ComfyUI output folder.

        Returns:
            List of absolute file paths to generated images.
        """
        if not history:
            return []
        outputs = history.get('outputs', {}) or {}
        image_paths: list[str] = []

        for node_id, node_output in outputs.items():
            images = node_output.get('images', [])
            for img in images:
                filename = img.get('filename', '')
                subfolder = img.get('subfolder', '')
                img_type = img.get('type', 'output')

                if not filename:
                    continue

                # Build the full path
                if comfyui_output_dir:
                    if subfolder:
                        full_path = os.path.join(comfyui_output_dir, subfolder, filename)
                    else:
                        full_path = os.path.join(comfyui_output_dir, filename)
                else:
                    # Use relative path from ComfyUI if no output dir specified
                    full_path = os.path.join(subfolder, filename) if subfolder else filename

                image_paths.append(full_path)

        return image_paths

    def download_output(self, filename: str, subfolder: str = '', output_type: str = 'output') -> bytes:
        """
        Downloads a generated image from ComfyUI's /view endpoint.

        Args:
            filename: The image filename.
            subfolder: Subfolder within the output directory.
            output_type: Usually 'output' or 'temp'.

        Returns:
            Raw image bytes.
        """
        params = {
            'filename': filename,
            'subfolder': subfolder,
            'type': output_type,
        }
        try:
            resp = requests.get(
                f"{self.base_url}/view",
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.content
        except requests.exceptions.ConnectionError:
            raise ComfyUIConnectionError(
                f"[ComfyUI Offline] Cannot download image — server is not responding."
            )

    # ------------------------------------------------------------------
    # High-level convenience method
    # ------------------------------------------------------------------

    def render(
        self,
        template_name: str,
        input_image: str | None = None,
        prompt: str = '',
        negative_prompt: str = '',
        seed: int = 42,
        output_folder: str = 'RenderPilot',
        width: int = 512,
        height: int = 512,
        steps: int = 20,
        cfg_scale: float = 8.0,
        denoise: float = 0.50,
        geometry_lock_mode: str = 'accurate',
        control_image: str | None = None,
        depth_control_image: str | None = None,
        comfyui_output_dir: str | None = None,
        on_progress=None,
        prompt_brain_provider: str = 'unknown',
        edge_control_strength: float | None = None,
        depth_control_strength: float | None = None,
    ) -> list[str]:
        """
        End-to-end render pipeline: load template, inject params, submit,
        wait, and collect outputs.

        Args:
            template_name: Name of the workflow template to use.
            input_image: Path to the input image (optional, depends on workflow).
            prompt: Positive prompt text.
            negative_prompt: Negative prompt text.
            seed: Random seed for reproducibility.
            output_folder: Prefix for output filenames.
            width: Output width (longest side, capped by capacity profile).
            height: Output height.
            steps: Sampling steps.
            cfg_scale: CFG guidance scale.
            denoise: Denoising strength.
            geometry_lock_mode: Geometry lock mode.
            comfyui_output_dir: ComfyUI output directory for path resolution.
            on_progress: Optional callback(current, total) for progress updates.

        Returns:
            List of absolute paths to generated image files.

        Raises:
            ComfyUIConnectionError: If ComfyUI is not running.
            ComfyUIExecutionError: If the workflow fails.
            FileNotFoundError: If the workflow template doesn't exist.
        """
        # Step 1: Health check
        self.check_health()

        # Step 2: Load and configure workflow
        workflow = self.load_workflow(template_name)
        workflow = self.inject_parameters(
            workflow=workflow,
            input_image=input_image,
            prompt=prompt,
            negative_prompt=negative_prompt,
            seed=seed,
            output_folder=output_folder,
            width=width,
            height=height,
            steps=steps,
            cfg_scale=cfg_scale,
            denoise=denoise,
            geometry_lock_mode=geometry_lock_mode,
            control_image=control_image,
            depth_control_image=depth_control_image,
            prompt_brain_provider=prompt_brain_provider,
            edge_control_strength=edge_control_strength,
            depth_control_strength=depth_control_strength,
        )

        # Step 3: Submit workflow
        prompt_id = self.submit_workflow(workflow)

        # Step 4: Wait for completion
        history = self.wait_for_completion(prompt_id, on_progress=on_progress)

        # Step 5: Collect output paths
        image_paths = self.collect_outputs(history, comfyui_output_dir)

        return image_paths
