"""
End-to-end integration test for the RenderPilot img2img render workflow.

Tests the full image-first pipeline against a live ComfyUI instance:
  1. Worker receives/loads input image
  2. Image is passed into ComfyUI workflow
  3. Positive/negative prompts are injected
  4. Denoise, steps, cfg, seed are injected
  5. ComfyUI generates 1 variation
  6. Output image is saved
  7. Worker collects the output path
  8. Job status becomes completed
  9. Failure states are handled cleanly
"""

import os
import sys
import json
import struct
import zlib
import tempfile
import time
from pathlib import Path

# Ensure worker module is importable
sys.path.append(str(Path(__file__).parent))

from comfyui_client import ComfyUIClient, ComfyUIConnectionError, ComfyUIExecutionError


def create_test_image(path: str, width: int = 512, height: int = 512):
    """
    Creates a minimal valid PNG file without any external dependencies.
    Generates a simple gradient pattern as test input.
    """
    def write_chunk(f, chunk_type, data):
        f.write(struct.pack('>I', len(data)))
        f.write(chunk_type)
        f.write(data)
        crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
        f.write(struct.pack('>I', crc))

    with open(path, 'wb') as f:
        # PNG signature
        f.write(b'\x89PNG\r\n\x1a\n')

        # IHDR chunk: width, height, bit depth 8, color type 2 (RGB)
        ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
        write_chunk(f, b'IHDR', ihdr_data)

        # IDAT chunk: uncompressed pixel data
        raw_data = b''
        for y in range(height):
            raw_data += b'\x00'  # filter byte (none)
            for x in range(width):
                r = int(255 * x / max(width - 1, 1))
                g = int(255 * y / max(height - 1, 1))
                b = int(128)
                raw_data += struct.pack('BBB', r, g, b)

        compressed = zlib.compress(raw_data)
        write_chunk(f, b'IDAT', compressed)

        # IEND chunk
        write_chunk(f, b'IEND', b'')

    print(f"  -> Created test image: {path} ({os.path.getsize(path)} bytes)")


def run_e2e_test():
    print("=" * 65)
    print("  RenderPilot End-to-End Image-to-Image Workflow Test")
    print("=" * 65)

    comfyui_url = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")
    passed = 0
    total = 9

    # ----------------------------------------------------------------
    # Step 1: Worker receives/loads input image
    # ----------------------------------------------------------------
    print(f"\n[Step 1/9] Worker receives/loads input image...")
    test_dir = os.path.join(os.path.dirname(__file__), "_test_workspace")
    os.makedirs(test_dir, exist_ok=True)
    test_image_path = os.path.join(test_dir, "test_input.png")
    create_test_image(test_image_path, 512, 512)

    if os.path.exists(test_image_path) and os.path.getsize(test_image_path) > 0:
        print("  -> PASS: Input image loaded and valid.")
        passed += 1
    else:
        print("  -> FAIL: Input image creation failed.")
        return False

    # ----------------------------------------------------------------
    # Step 2: Image is passed into ComfyUI workflow (upload + LoadImage)
    # ----------------------------------------------------------------
    print(f"\n[Step 2/9] Uploading image into ComfyUI and loading workflow...")
    client = ComfyUIClient(comfyui_url)

    try:
        client.check_health()
        print("  -> ComfyUI health check passed.")
    except ComfyUIConnectionError as e:
        print(f"  -> FAIL: ComfyUI not reachable: {e}")
        return False

    try:
        comfyui_image_name = client.upload_image(test_image_path)
        print(f"  -> PASS: Image uploaded to ComfyUI as '{comfyui_image_name}'.")
        passed += 1
    except Exception as e:
        print(f"  -> FAIL: Image upload failed: {e}")
        return False

    workflow = client.load_workflow("img2img_default")
    print(f"  -> Loaded img2img_default workflow with nodes: {list(workflow.keys())}")

    # ----------------------------------------------------------------
    # Step 3: Positive/negative prompts are injected
    # ----------------------------------------------------------------
    print(f"\n[Step 3/9] Injecting positive/negative prompts...")
    test_prompt = "modern villa exterior, warm sunset lighting, travertine marble, photorealistic"
    test_neg_prompt = "low quality, blurry, watermark, distorted, overexposed"

    workflow = client.inject_parameters(
        workflow=workflow,
        input_image=comfyui_image_name,
        prompt=test_prompt,
        negative_prompt=test_neg_prompt,
        seed=12345,
        width=512,
        height=512,
        steps=8,
        cfg_scale=7.0,
        denoise=0.65,
        output_folder="E2E_Test",
    )

    # Verify prompts were injected correctly
    prompt_injected = False
    neg_prompt_injected = False
    for node_id, node in workflow.items():
        if node.get('class_type') == 'CLIPTextEncode':
            text_val = node.get('inputs', {}).get('text', '')
            meta_title = node.get('_meta', {}).get('title', '').lower()
            if 'negative' in meta_title and text_val == test_neg_prompt:
                neg_prompt_injected = True
            elif 'negative' not in meta_title and test_prompt in text_val:
                prompt_injected = True

    if prompt_injected and neg_prompt_injected:
        print("  -> PASS: Positive and negative prompts injected correctly.")
        passed += 1
    else:
        print(f"  -> FAIL: Prompt injection incomplete (pos={prompt_injected}, neg={neg_prompt_injected}).")
        return False

    # ----------------------------------------------------------------
    # Step 4: Denoise, steps, cfg, seed are injected
    # ----------------------------------------------------------------
    print(f"\n[Step 4/9] Verifying denoise, steps, cfg, seed injection...")
    sampler_verified = False
    for node_id, node in workflow.items():
        if node.get('class_type') == 'KSampler':
            inputs = node.get('inputs', {})
            checks = {
                'seed': (inputs.get('seed'), 12345),
                'steps': (inputs.get('steps'), 8),
                'cfg': (inputs.get('cfg'), 7.0),
                'denoise': (inputs.get('denoise'), 0.65),
            }
            all_match = True
            for param, (actual, expected) in checks.items():
                if actual != expected:
                    print(f"  -> FAIL: KSampler.{param} = {actual}, expected {expected}")
                    all_match = False
                else:
                    print(f"  -> {param}: {actual} (correct)")
            sampler_verified = all_match
            break

    if sampler_verified:
        print("  -> PASS: All KSampler parameters injected correctly.")
        passed += 1
    else:
        print("  -> FAIL: KSampler parameter injection failed.")
        return False

    # Verify input image was injected into LoadImage node
    load_image_verified = False
    for node_id, node in workflow.items():
        if node.get('class_type') == 'LoadImage':
            actual_image = node.get('inputs', {}).get('image', '')
            if actual_image == comfyui_image_name:
                print(f"  -> LoadImage.image: '{actual_image}' (correct)")
                load_image_verified = True
            else:
                print(f"  -> FAIL: LoadImage.image = '{actual_image}', expected '{comfyui_image_name}'")

    if not load_image_verified:
        print("  -> FAIL: Input image not injected into LoadImage node.")
        return False

    # ----------------------------------------------------------------
    # Step 5: ComfyUI generates 1 variation
    # ----------------------------------------------------------------
    print(f"\n[Step 5/9] Submitting workflow to ComfyUI and generating 1 variation...")
    try:
        prompt_id = client.submit_workflow(workflow)
        print(f"  -> Workflow submitted. prompt_id: {prompt_id}")
    except Exception as e:
        print(f"  -> FAIL: Workflow submission failed: {e}")
        return False

    progress_updates = []
    def on_progress(current, total):
        progress_updates.append((current, total))
        print(f"  -> Sampling progress: {current}/{total}")

    try:
        history = client.wait_for_completion(prompt_id, on_progress=on_progress)
        print(f"  -> PASS: ComfyUI completed workflow execution successfully.")
        passed += 1
    except Exception as e:
        print(f"  -> FAIL: Execution failed: {e}")
        return False

    # ----------------------------------------------------------------
    # Step 6: Output image is saved
    # ----------------------------------------------------------------
    print(f"\n[Step 6/9] Verifying output image was saved by ComfyUI...")
    outputs = history.get('outputs', {})
    has_saved_image = False
    for node_id, node_output in outputs.items():
        images = node_output.get('images', [])
        for img in images:
            if img.get('filename'):
                has_saved_image = True
                print(f"  -> Found output: {img.get('filename')} (type={img.get('type', 'output')})")

    if has_saved_image:
        print("  -> PASS: ComfyUI saved output image(s).")
        passed += 1
    else:
        print("  -> FAIL: No output images found in ComfyUI history.")
        return False

    # ----------------------------------------------------------------
    # Step 7: Worker collects the output path
    # ----------------------------------------------------------------
    print(f"\n[Step 7/9] Collecting output paths from execution history...")
    try:
        output_paths = client.collect_outputs(history)
        print(f"  -> Collected paths: {output_paths}")

        if not output_paths:
            print("  -> FAIL: No output paths collected.")
            return False

        # Verify we can download the output via the API
        for path in output_paths:
            filename = os.path.basename(path)
            img_bytes = client.download_output(filename)
            local_output = os.path.join(test_dir, f"downloaded_{filename}")
            with open(local_output, 'wb') as f:
                f.write(img_bytes)
            print(f"  -> Downloaded '{filename}' ({len(img_bytes)} bytes) -> {local_output}")

        print("  -> PASS: All output paths collected and files downloaded.")
        passed += 1
    except Exception as e:
        print(f"  -> FAIL: Output collection failed: {e}")
        return False

    # ----------------------------------------------------------------
    # Step 8: Job status becomes completed (simulated via history check)
    # ----------------------------------------------------------------
    print(f"\n[Step 8/9] Verifying job completion status...")
    # In the real worker, this is a DB update. Here we verify:
    # - history is non-None (meaning execution finished)
    # - outputs contain at least one image
    # - no execution errors in the status info
    status_outputs = history.get('outputs', {})
    status_info = history.get('status', {})
    status_completed = status_info.get('completed', False) if status_info else False

    # Check for explicit error messages in the history
    has_errors = False
    for node_id, node_output in status_outputs.items():
        if 'error' in str(node_output).lower():
            has_errors = True

    if history and output_paths and not has_errors:
        print(f"  -> History present: True")
        print(f"  -> Outputs count: {len(output_paths)}")
        print(f"  -> Errors detected: False")
        print("  -> PASS: Job execution completed successfully (ready for DB status=completed).")
        passed += 1
    else:
        print(f"  -> FAIL: Job did not complete cleanly (history={bool(history)}, outputs={len(output_paths)}, errors={has_errors}).")
        return False

    # ----------------------------------------------------------------
    # Step 9: Failure states are handled cleanly
    # ----------------------------------------------------------------
    print(f"\n[Step 9/9] Testing failure state handling...")
    failure_tests_passed = 0
    failure_tests_total = 3

    # 9a. Offline ComfyUI connection failure
    print("  [9a] Testing offline ComfyUI connection handling...")
    offline_client = ComfyUIClient("http://127.0.0.1:9999")
    try:
        offline_client.check_health()
        print("  -> FAIL: Should have raised ComfyUIConnectionError.")
    except ComfyUIConnectionError as e:
        print(f"  -> PASS: Raised ComfyUIConnectionError: {str(e)[:80]}...")
        failure_tests_passed += 1
    except Exception as e:
        print(f"  -> FAIL: Raised unexpected error: {e}")

    # 9b. Invalid workflow template
    print("  [9b] Testing invalid workflow template handling...")
    try:
        client.load_workflow("nonexistent_workflow_xyz")
        print("  -> FAIL: Should have raised FileNotFoundError.")
    except FileNotFoundError as e:
        print(f"  -> PASS: Raised FileNotFoundError: {str(e)[:80]}...")
        failure_tests_passed += 1
    except Exception as e:
        print(f"  -> FAIL: Raised unexpected error: {e}")

    # 9c. Missing input image for upload
    print("  [9c] Testing missing input image upload handling...")
    try:
        client.upload_image("/nonexistent/path/to/fake_image.png")
        print("  -> FAIL: Should have raised FileNotFoundError.")
    except FileNotFoundError as e:
        print(f"  -> PASS: Raised FileNotFoundError: {str(e)[:80]}...")
        failure_tests_passed += 1
    except Exception as e:
        print(f"  -> FAIL: Raised unexpected error type ({type(e).__name__}): {e}")

    if failure_tests_passed == failure_tests_total:
        print("  -> PASS: All failure states handled cleanly.")
        passed += 1
    else:
        print(f"  -> PARTIAL: {failure_tests_passed}/{failure_tests_total} failure tests passed.")

    # ----------------------------------------------------------------
    # Final Summary
    # ----------------------------------------------------------------
    print("\n" + "=" * 65)
    if passed == total:
        print(f"  ALL {total}/{total} END-TO-END IMG2IMG TESTS PASSED!")
    else:
        print(f"  RESULT: {passed}/{total} tests passed. Some checks failed.")
    print("=" * 65)

    # Cleanup test workspace
    print("\nCleaning up test workspace...")
    try:
        import shutil
        shutil.rmtree(test_dir, ignore_errors=True)
        print("  -> Test workspace cleaned.")
    except Exception:
        print("  -> Warning: Could not clean up test workspace.")

    return passed == total


if __name__ == "__main__":
    success = run_e2e_test()
    sys.exit(0 if success else 1)
