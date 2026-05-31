import os
import time
import subprocess
import requests
from dotenv import load_dotenv

# Load env variables from root directory
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

API_URL = "http://127.0.0.1:8000"
BLENDER_EXE = os.getenv("BLENDER_EXE_PATH", r"C:\Program Files\Blender Foundation\Blender 4.1\blender.exe")
STORAGE_PATH = os.getenv("PROJECT_STORAGE_PATH", os.path.join(os.path.dirname(__file__), "../../storage"))

def check_blender_installation():
    if not os.path.exists(BLENDER_EXE):
        print(f"[Warning] Blender executable not found at: {BLENDER_EXE}")
        print("Headless Blender runs will fall back to simulations in development.")
        return False
    print(f"[Info] Blender executable verified at: {BLENDER_EXE}")
    return True

def poll_render_jobs():
    """Polls the API for PENDING jobs needing Blender extraction."""
    print("[Info] Blender Worker started. Polling for rendering tasks...")
    has_blender = check_blender_installation()
    
    while True:
        try:
            # Check API connection and fetch projects
            response = requests.get(f"{API_URL}/projects")
            if response.status_code == 200:
                projects = response.json()
                for project in projects:
                    # Fetch jobs for this project
                    jobs_resp = requests.get(f"{API_URL}/render/project/{project['id']}")
                    if jobs_resp.status_code == 200:
                        jobs = jobs_resp.json()
                        pending_jobs = [j for j in jobs if j["status"] == "PENDING"]
                        for job in pending_jobs:
                            process_job(job, project, has_blender)
            
        except requests.exceptions.ConnectionError:
            print("[Info] Awaiting backend API to come online...")
            
        time.sleep(5)  # Poll interval

def process_job(job, project, has_blender):
    job_id = job["id"]
    print(f"\n[Job {job_id}] Found PENDING job. Starting Blender phase...")
    
    # Update status to BLENDER_EXPORT
    update_url = f"{API_URL}/render/{job_id}/update"
    requests.post(update_url, params={"status": "BLENDER_EXPORT"})
    
    # Define local filepaths
    source_file = os.path.join(STORAGE_PATH, "projects", project["source_file"])
    output_dir = os.path.join(STORAGE_PATH, "outputs")
    os.makedirs(output_dir, exist_ok=True)
    temp_pass_output = os.path.join(output_dir, f"{job_id}_blender_depth.png")
    
    print(f"[Job {job_id}] Processing file: {source_file}")
    
    if has_blender:
        # Run Blender in headless mode, executing script to export depth map
        # Command syntax: blender -b <blend_file> -P <script.py> -- <args>
        print(f"[Job {job_id}] Invoking Blender process...")
        try:
            # Placeholders for actual rendering python script arguments
            cmd = [
                BLENDER_EXE,
                "-b", source_file,
                "--python-expr", "import bpy; print('Scene loaded. Exporting architectural geometry passes.')"
            ]
            # Run the command
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            print(f"[Job {job_id}] Blender stdout: {result.stdout[:200]}...")
            
            # Create a mock depth pass file since we're headlessly rendering templates
            with open(temp_pass_output, "w") as f:
                f.write("MOCK_BLENDER_DEPTH_GEOMETRY_PASS")
                
        except Exception as e:
            print(f"[Job {job_id}] Blender run failed: {str(e)}")
            requests.post(update_url, params={"status": "FAILED", "error_message": f"Blender error: {str(e)}"})
            return
    else:
        # Simulate local Blender rendering
        print(f"[Job {job_id}] Blender binary not available. Simulating scene extraction...")
        time.sleep(3)
        with open(temp_pass_output, "w") as f:
            f.write("MOCK_BLENDER_DEPTH_GEOMETRY_PASS")
            
    print(f"[Job {job_id}] Blender pass completed. Temporary pass output saved: {temp_pass_output}")
    
    # Hand off to the generative processing phase
    # Update status to next step (GENERATING) so comfy_worker picks it up
    requests.post(update_url, params={"status": "GENERATING"})
    print(f"[Job {job_id}] Status updated to GENERATING. Handed off to ComfyUI worker.")

if __name__ == "__main__":
    poll_render_jobs()
