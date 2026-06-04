import sys
import os
import shutil

# Add apps/worker to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "apps", "worker"))

import storage
from main import detect_material_class, get_default_finish
from blender_pipeline import run_camera_preview_pipeline

# Configure mock upload to save output directly to the artifact directory
ARTIFACT_DIR = r"C:\Users\Vaidehi\.gemini\antigravity-ide\brain\002ca4f7-6abe-4bd7-9490-e5a71e62c406"

def mock_upload(localPath, key):
    print(f"\n[Mock Upload] Intercepted upload of: {localPath}")
    filename = os.path.basename(localPath)
    dest_path = os.path.join(ARTIFACT_DIR, f"sample_{filename}")
    shutil.copy2(localPath, dest_path)
    print(f"[Mock Upload] Successfully saved rendered image to: {dest_path}")

storage.uploadFileFromWorker = mock_upload

def run_test():
    print("=" * 70)
    print("Running Headless Blender Render & Material Detection Test")
    print("=" * 70)
    
    blend_path = os.path.join(os.getcwd(), "sample_model.blend")
    if not os.path.exists(blend_path):
        print(f"Error: {blend_path} not found. Run scripts/create_test_blend.py first.")
        sys.exit(1)
        
    job_id = "job_test_render_01"
    project_id = "project_test_render_01"
    user_id = "user_test_render_01"
    
    print(f"Invoking camera preview pipeline on {blend_path}...")
    candidates, detected_materials = run_camera_preview_pipeline(job_id, project_id, user_id, blend_path)
    
    print("\n" + "=" * 70)
    print("Camera Candidates Generated:")
    for c in candidates:
        print(f" - index {c['index']}: {c['name']} at {c['location']}")
        
    print("\n" + "=" * 70)
    print("Model-Based Material Detection Results:")
    print("=" * 70)
    for idx, item in enumerate(detected_materials):
        obj_name = item.get("object_name", "")
        mat_name = item.get("material_name", "")
        collections = item.get("collections", [])
        base_color = item.get("base_color", [1.0, 1.0, 1.0, 1.0])
        
        det_class, confidence, reason = detect_material_class(
            obj_name, mat_name, collections, base_color
        )
        finish = get_default_finish(det_class, mat_name)
        
        print(f"\nItem {idx+1}:")
        print(f"  Object Name  : {obj_name}")
        print(f"  Material Name: {mat_name if mat_name else '(none)'}")
        print(f"  Collections  : {collections}")
        print(f"  Base Color   : {base_color}")
        print(f"  -> Guessed Category: {det_class.upper()}")
        print(f"  -> Guessed Finish  : \"{finish}\"")
        print(f"  -> Confidence      : {confidence * 100:.0f}%")
        print(f"  -> Reason          : {reason}")
    print("=" * 70)
    print("Test run completed successfully!")

if __name__ == "__main__":
    run_test()
