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

if __name__ == "__main__":
    run_tests()
