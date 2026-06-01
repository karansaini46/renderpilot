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
        width: int = 768,
        height: int = 768,
        steps: int = 20,
        cfg_scale: float = 7.0,
        denoise: float = 1.0,
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

        Returns:
            The modified workflow dict.
        """
        for node_id, node in workflow.items():
            class_type = node.get('class_type', '')
            inputs = node.get('inputs', {})

            # KSampler and KSamplerAdvanced nodes — inject seed, steps, cfg
            if class_type in ('KSampler', 'KSamplerAdvanced'):
                if 'seed' in inputs:
                    inputs['seed'] = seed
                if 'steps' in inputs:
                    inputs['steps'] = steps
                if 'cfg' in inputs:
                    inputs['cfg'] = cfg_scale
                if 'denoise' in inputs:
                    inputs['denoise'] = denoise

            # CLIP Text Encode nodes — inject prompts
            # Convention: node title or _meta.title containing "negative" gets negative prompt
            if class_type == 'CLIPTextEncode':
                meta_title = node.get('_meta', {}).get('title', '').lower()
                if 'negative' in meta_title or 'neg' in meta_title:
                    if 'text' in inputs:
                        inputs['text'] = negative_prompt
                else:
                    if 'text' in inputs:
                        inputs['text'] = prompt

            # Empty Latent Image — inject dimensions
            if class_type == 'EmptyLatentImage':
                if 'width' in inputs:
                    inputs['width'] = width
                if 'height' in inputs:
                    inputs['height'] = height

            # Load Image node — inject input image path
            if class_type == 'LoadImage' and input_image:
                if 'image' in inputs:
                    inputs['image'] = input_image

            # Save Image / Preview Image — inject output prefix
            if class_type in ('SaveImage', 'PreviewImage'):
                if 'filename_prefix' in inputs and output_folder:
                    inputs['filename_prefix'] = output_folder

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
                        return self._fetch_history(prompt_id)

                    # Execution error
                    if msg_type == 'execution_error' and data.get('prompt_id') == prompt_id:
                        error_msg = data.get('exception_message', 'Unknown execution error')
                        node_id = data.get('node_id', 'unknown')
                        raise ComfyUIExecutionError(
                            f"[ComfyUI Error] Workflow failed at node {node_id}: {error_msg}"
                        )

                    # Queue status — check if our prompt was removed (completed/errored)
                    if msg_type == 'status':
                        queue = data.get('status', {}).get('exec_info', {})
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
        outputs = history.get('outputs', {})
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
        width: int = 768,
        height: int = 768,
        steps: int = 20,
        cfg_scale: float = 7.0,
        denoise: float = 1.0,
        comfyui_output_dir: str | None = None,
        on_progress=None,
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
        )

        # Step 3: Submit workflow
        prompt_id = self.submit_workflow(workflow)

        # Step 4: Wait for completion
        history = self.wait_for_completion(prompt_id, on_progress=on_progress)

        # Step 5: Collect output paths
        image_paths = self.collect_outputs(history, comfyui_output_dir)

        return image_paths
