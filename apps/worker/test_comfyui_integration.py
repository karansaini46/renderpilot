import os
import sys
import json
from pathlib import Path

# Add apps/worker to Python path
sys.path.append(str(Path(__file__).parent))

from comfyui_client import ComfyUIClient, ComfyUIConnectionError, ComfyUIExecutionError

def run_tests():
    print("=========================================================")
    print("  ComfyUI Client Integration Verification Test Suite  ")
    print("=========================================================")
    
    # 1. Read COMFYUI_URL from env or default
    comfyui_url = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")
    print(f"[Step 1] Read COMFYUI_URL from env: {comfyui_url}")
    
    # 2. Initialize ComfyUI client and call /system_stats
    print("[Step 2] Initializing client and calling /system_stats...")
    client = ComfyUIClient(comfyui_url)
    try:
        stats = client.check_health()
        print("  -> /system_stats response successful!")
        print(f"  -> System Stats: OS={stats.get('system', {}).get('os')}, Python={stats.get('system', {}).get('python_version')}")
    except Exception as e:
        print(f"  -> FAIL: Could not call check_health: {e}")
        sys.exit(1)
        
    # 3. Detect ComfyUI online
    print("[Step 3] Detecting ComfyUI online...")
    is_online = client.is_healthy()
    print(f"  -> is_healthy() returned: {is_online}")
    if not is_online:
        print("  -> FAIL: ComfyUI reported as unhealthy.")
        sys.exit(1)
        
    # 4. Fail cleanly if ComfyUI is offline
    print("[Step 4] Verifying clean failure when ComfyUI is offline...")
    offline_client = ComfyUIClient("http://127.0.0.1:9999") # Dummy offline port
    try:
        offline_client.check_health()
        print("  -> FAIL: Offline health check did not raise exception.")
        sys.exit(1)
    except ComfyUIConnectionError as conn_err:
        print("  -> PASS: Raised ComfyUIConnectionError as expected:")
        print(f"     {conn_err}")
    except Exception as e:
        print(f"  -> FAIL: Raised unexpected exception: {e}")
        sys.exit(1)
        
    # 5. Load workflow JSON from apps/worker/workflows
    print("[Step 5] Loading workflow JSON from apps/worker/workflows...")
    try:
        workflow = client.load_workflow("txt2img_default")
        print("  -> Successfully loaded txt2img_default.json template!")
        print(f"  -> Workflow contains nodes: {list(workflow.keys())}")
    except Exception as e:
        print(f"  -> FAIL: Could not load workflow JSON: {e}")
        sys.exit(1)
        
    # 6. Submit a test workflow to ComfyUI
    print("[Step 6] Submitting a test workflow to ComfyUI...")
    try:
        # Inject standard parameters
        workflow = client.inject_parameters(
            workflow=workflow,
            prompt="a beautiful architectural sketch of a modern villa, travertine marble, glowing lighting, Sunset",
            negative_prompt="low quality, bad lighting, blurry, worst quality",
            seed=42,
            width=512,
            height=512,
            steps=5, # short steps for fast test
        )
        
        prompt_id = client.submit_workflow(workflow)
        print(f"  -> Workflow submitted successfully. prompt_id: {prompt_id}")
    except Exception as e:
        print(f"  -> FAIL: Submit workflow failed: {e}")
        sys.exit(1)
        
    # 7. Poll until completion
    print("[Step 7] Polling until completion (using WebSocket/REST callback)...")
    def on_progress(current, total):
        print(f"  -> Progress: {current}/{total} steps")
        
    try:
        history = client.wait_for_completion(prompt_id, on_progress=on_progress)
        print("  -> Workflow execution completed successfully!")
    except Exception as e:
        print(f"  -> FAIL: Polling/execution failed: {e}")
        sys.exit(1)
        
    # 8. Collect generated output image paths
    print("[Step 8] Collecting generated output image paths...")
    try:
        output_paths = client.collect_outputs(history)
        print(f"  -> Collected output paths: {output_paths}")
        if not output_paths:
            print("  -> FAIL: No output paths collected.")
            sys.exit(1)
            
        print("  -> Verifying output files retrieval via API:")
        for path in output_paths:
            filename = os.path.basename(path)
            img_bytes = client.download_output(filename)
            print(f"     Downloaded {filename} ({len(img_bytes)} bytes) successfully.")
            
        print("=========================================================")
        print("  ALL 8 COMFYUI INTEGRATION TESTS PASSED SUCCESSFULLY!   ")
        print("=========================================================")
    except Exception as e:
        print(f"  -> FAIL: Collecting/downloading outputs failed: {e}")
        sys.exit(1)

def test_controlnet_render():
    print("=========================================================")
    print("  Testing ControlNet Parameter Injection (Pre-flight)   ")
    print("=========================================================")
    
    # 1. Instantiate client
    comfyui_url = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")
    client = ComfyUIClient(comfyui_url)
    
    # 2. Check health - skip if fails
    try:
        client.check_health()
    except Exception as e:
        print(f"Skipping test_controlnet_render: ComfyUI server not running or unreachable ({e})")
        return

    # 3. Check controlnet available and assert True
    controlnet_ok = client.check_controlnet_available("control_v11p_sd15_canny.pth")
    print(f"ControlNet model 'control_v11p_sd15_canny.pth' available: {controlnet_ok}")
    assert controlnet_ok is True, "ControlNet model control_v11p_sd15_canny.pth is not available in ComfyUI"

    # 4. Load img2img_default workflow
    workflow = client.load_workflow("img2img_default")

    # 5. Get input/control images
    from PIL import Image
    temp_img_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "temp_test_image.png"))
    try:
        img = Image.new('RGB', (64, 64), color='white')
        img.save(temp_img_path)

        # Inject parameters
        workflow = client.inject_parameters(
            workflow=workflow,
            input_image=temp_img_path,
            control_image=temp_img_path,
            prompt="photorealistic architectural exterior, clean concrete walls, natural lighting",
            negative_prompt="blurry, distorted, low quality",
            seed=42,
            denoise=0.50,
            geometry_lock_mode="accurate",
            steps=10,
            width=512,
            height=512,
        )

        # 6. Assert KSampler node has denoise == 0.50
        ksampler_node = None
        controlnet_apply_node = None
        canny_control_image_node = None

        for node_id, node in workflow.items():
            class_type = node.get("class_type")
            meta_title = node.get("_meta", {}).get("title", "")
            
            if class_type == "KSampler":
                ksampler_node = node
            elif class_type == "ControlNetApply":
                controlnet_apply_node = node
            elif class_type == "LoadImage" and meta_title == "Load Canny Control Image":
                canny_control_image_node = node

        assert ksampler_node is not None, "KSampler node not found in workflow"
        injected_denoise = ksampler_node["inputs"]["denoise"]
        print(f"KSampler injected denoise: {injected_denoise}")
        assert injected_denoise == 0.50, f"Expected KSampler denoise to be 0.50, got {injected_denoise}"

        # 7. Assert ControlNetApply node has strength > 0 and <= 1.0
        assert controlnet_apply_node is not None, "ControlNetApply node not found in workflow"
        injected_strength = controlnet_apply_node["inputs"]["strength"]
        print(f"ControlNetApply strength: {injected_strength}")
        assert 0.0 < injected_strength <= 1.0, f"Expected strength to be > 0 and <= 1.0, got {injected_strength}"

        # 8. Assert LoadImage node "Load Canny Control Image" has image field set (not default/placeholder)
        assert canny_control_image_node is not None, "Canny control image node not found in workflow"
        injected_control_image = canny_control_image_node["inputs"]["image"]
        print(f"Canny control image: '{injected_control_image}'")
        assert injected_control_image == temp_img_path, f"Expected control image path to be {temp_img_path}, got {injected_control_image}"

        # 9. Print summary
        found_nodes = [node.get("class_type") for node in workflow.values()]
        print("\nSummary:")
        print(f"  - Nodes found in workflow: {', '.join(found_nodes)}")
        print(f"  - Denoise value: {injected_denoise}")
        print(f"  - Control strength: {injected_strength}")
        print("  ControlNet parameter injection test PASSED successfully!\n")

    finally:
        if os.path.exists(temp_img_path):
            os.remove(temp_img_path)

if __name__ == "__main__":
    test_controlnet_render()
