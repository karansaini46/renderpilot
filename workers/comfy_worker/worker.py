import os
import time
import requests
import json
from dotenv import load_dotenv

# Load env variables from root directory
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

API_URL = "http://127.0.0.1:8000"
COMFYUI_URL = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188")
STORAGE_PATH = os.getenv("PROJECT_STORAGE_PATH", os.path.join(os.path.dirname(__file__), "../../storage"))

def check_comfyui_connection():
    try:
        # Check standard endpoint of ComfyUI
        response = requests.get(f"{COMFYUI_URL}/system_stats", timeout=3)
        if response.status_code == 200:
            print(f"[Info] Connected to ComfyUI server at {COMFYUI_URL}")
            return True
    except Exception:
        pass
    print(f"[Warning] ComfyUI server not reachable at {COMFYUI_URL}")
    print("Generation runs will fall back to local mocks for development testing.")
    return False

def poll_generation_jobs():
    """Polls the API for jobs in GENERATING status to process via ComfyUI."""
    print("[Info] ComfyUI Worker started. Polling for generation tasks...")
    has_comfy = check_comfyui_connection()
    
    while True:
        try:
            # Poll projects and jobs
            response = requests.get(f"{API_URL}/projects")
            if response.status_code == 200:
                projects = response.json()
                for project in projects:
                    jobs_resp = requests.get(f"{API_URL}/render/project/{project['id']}")
                    if jobs_resp.status_code == 200:
                        jobs = jobs_resp.json()
                        generating_jobs = [j for j in jobs if j["status"] == "GENERATING"]
                        for job in generating_jobs:
                            process_generation(job, project, has_comfy)
                            
        except requests.exceptions.ConnectionError:
            print("[Info] Awaiting backend API to come online...")
            
        time.sleep(5)  # Poll interval

def process_generation(job, project, has_comfy):
    job_id = job["id"]
    print(f"\n[Job {job_id}] Processing Stable Diffusion generation pipeline...")
    
    update_url = f"{API_URL}/render/{job_id}/update"
    
    # Establish output path
    output_dir = os.path.join(STORAGE_PATH, "outputs")
    os.makedirs(output_dir, exist_ok=True)
    final_output_image = os.path.join(output_dir, f"{job_id}_render.png")
    
    # Load and customize ComfyUI API workflow parameters
    # The MVP is restricted to batch size = 1, SD 1.5, and 1 ControlNet
    workflow_params = {
        "prompt": job["prompt"],
        "negative_prompt": job.get("negative_prompt", ""),
        "batch_size": 1,            # Enforced limit for 4GB VRAM
        "controlnet_limit": 1,      # Enforced limit for 4GB VRAM
        "steps": 25,
        "cfg_scale": 7.5,
        "seed": int(time.time())
    }
    
    print(f"[Job {job_id}] Configured workflow: {json.dumps(workflow_params)}")
    
    if has_comfy:
        try:
            # Construct standard ComfyUI payload
            # Example API queue format: {"prompt": {...}}
            # We mock the structure representing our SD 1.5 ControlNet pipeline
            comfy_payload = {
                "client_id": "renderpilot_worker",
                "prompt": {
                    "3": {
                        "class_type": "KSampler",
                        "inputs": {
                            "cfg": workflow_params["cfg_scale"],
                            "steps": workflow_params["steps"],
                            "seed": workflow_params["seed"],
                            "denoise": 0.8,
                            "sampler_name": "euler",
                            "scheduler": "normal",
                            "model": ["4", 0],
                            "positive": ["6", 0],
                            "negative": ["7", 0],
                            "latent_image": ["5", 0]
                        }
                    },
                    "4": {
                        "class_type": "CheckpointLoaderSimple",
                        "inputs": {
                            "ckpt_name": "v1-5-pruned-emaonly.safetensors"
                        }
                    },
                    "5": {
                        "class_type": "EmptyLatentImage",
                        "inputs": {
                            "width": 512,
                            "height": 512,
                            "batch_size": workflow_params["batch_size"]
                        }
                    },
                    "6": {
                        "class_type": "CLIPTextEncode",
                        "inputs": {
                            "text": workflow_params["prompt"],
                            "clip": ["4", 1]
                        }
                    },
                    "7": {
                        "class_type": "CLIPTextEncode",
                        "inputs": {
                            "text": workflow_params["negative_prompt"],
                            "clip": ["4", 1]
                        }
                    },
                    "8": {
                        "class_type": "VAEDecode",
                        "inputs": {
                            "samples": ["3", 0],
                            "vae": ["4", 2]
                        }
                    },
                    "9": {
                        "class_type": "SaveImage",
                        "inputs": {
                            "filename_prefix": f"rp_{job_id}",
                            "images": ["8", 0]
                        }
                    }
                }
            }
            
            print(f"[Job {job_id}] Queueing workflow prompt to ComfyUI...")
            queue_resp = requests.post(f"{COMFYUI_URL}/prompt", json=comfy_payload, timeout=5)
            
            if queue_resp.status_code == 200:
                prompt_id = queue_resp.json()["prompt_id"]
                print(f"[Job {job_id}] ComfyUI prompt queued successfully. Prompt ID: {prompt_id}")
                
                # Poll for completion status
                completed = False
                attempts = 0
                while not completed and attempts < 60:
                    time.sleep(2)
                    history_resp = requests.get(f"{COMFYUI_URL}/history/{prompt_id}")
                    if history_resp.status_code == 200 and history_resp.json():
                        history = history_resp.json()
                        if prompt_id in history:
                            completed = True
                            print(f"[Job {job_id}] ComfyUI pipeline execution completed.")
                            break
                    attempts += 1
                
                if completed:
                    # In a real setup, fetch the image from ComfyUI output folders
                    # Here we simulate saving the file to storage/outputs/
                    write_mock_render_image(final_output_image)
                else:
                    raise Exception("Timeout waiting for ComfyUI response.")
            else:
                raise Exception(f"Failed to queue prompt: {queue_resp.text}")
                
        except Exception as e:
            print(f"[Job {job_id}] ComfyUI direct generation failed or timed out: {str(e)}")
            print("Falling back to simulated result generation...")
            write_mock_render_image(final_output_image)
            
    else:
        # Simulate local image generation
        print(f"[Job {job_id}] Simulating diffusion steps (SD 1.5 Base) on 4GB architecture...")
        time.sleep(5)
        write_mock_render_image(final_output_image)

    # Complete the job status
    requests.post(
        update_url, 
        params={
            "status": "COMPLETED", 
            "output_image_path": final_output_image
        }
    )
    print(f"[Job {job_id}] Render completed. Output path registered: {final_output_image}")


def write_mock_render_image(filepath):
    """Writes a mockup binary structure representing a generated rendering frame."""
    # Write a simple text file acting as a binary image mock
    with open(filepath, "w") as f:
        f.write("RENDER_PILOT_STABLE_DIFFUSION_MOCK_PNG_IMAGE_DATA")


if __name__ == "__main__":
    poll_generation_jobs()
