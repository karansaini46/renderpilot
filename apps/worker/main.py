import os
import sys
import time
import signal
import socket
import random
import datetime
import threading
import subprocess
import psycopg2
import json
from config import config
from capacity import load_profile, downshift_job_settings, requires_review, LAPTOP_PROFILE
from storage import downloadFileToWorker, uploadFileFromWorker
from comfyui_client import ComfyUIClient, ComfyUIConnectionError, ComfyUIExecutionError

# Control flag for grace shutdown handling
running = True
active_job_id = None
worker_state = {
    "status": "online",
    "mode": "idle"
}

# Load capacity profile (uses LAPTOP_PROFILE defaults)
capacity_profile = load_profile()

class LocalResourceLock:
    def __init__(self, workspace_root):
        self.lock_file = os.path.join(workspace_root, "local_resource_lock.json")
        self.thread_lock = threading.Lock()

    def _read_lock(self):
        if not os.path.exists(self.lock_file):
            return {
                "activeJobId": None,
                "activeStage": None,
                "startedAt": None,
                "status": "IDLE"
            }
        try:
            with open(self.lock_file, "r") as f:
                data = json.load(f)
                return {
                    "activeJobId": data.get("activeJobId"),
                    "activeStage": data.get("activeStage"),
                    "startedAt": data.get("startedAt"),
                    "status": data.get("status", "IDLE")
                }
        except Exception:
            return {
                "activeJobId": None,
                "activeStage": None,
                "startedAt": None,
                "status": "IDLE"
            }

    def _write_lock(self, data):
        try:
            # Ensure workspace directory exists (in case it is deleted)
            os.makedirs(os.path.dirname(self.lock_file), exist_ok=True)
            with open(self.lock_file, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"[Resource Lock] Error writing lock file: {e}", file=sys.stderr)

    def acquire(self, job_id: str, stage: str) -> bool:
        with self.thread_lock:
            lock_data = self._read_lock()
            
            # Check timeout of current lock if BUSY
            if lock_data["status"] == "BUSY" and lock_data["startedAt"]:
                try:
                    started_dt = datetime.datetime.fromisoformat(lock_data["startedAt"])
                    timeout_mins = int(os.environ.get("LOCAL_RESOURCE_LOCK_TIMEOUT_MINUTES", "60"))
                    elapsed = (datetime.datetime.now() - started_dt).total_seconds() / 60.0
                    if elapsed > timeout_mins:
                        print(f"[Resource Lock] Force releasing stale lock for job {lock_data['activeJobId']} stage {lock_data['activeStage']} due to timeout.", file=sys.stderr)
                        self.release_without_thread_lock()
                        lock_data = self._read_lock()
                except Exception as ex:
                    print(f"[Resource Lock] Error parsing lock timestamp: {ex}", file=sys.stderr)
            
            if lock_data["status"] == "BUSY":
                # Check if it's the same job and stage (re-entrant lock)
                if lock_data["activeJobId"] == job_id and lock_data["activeStage"] == stage:
                    return True
                
                print(f"[Resource Lock] Local worker is busy. Job will start after the current job finishes. (Active Job: {lock_data['activeJobId']}, Stage: {lock_data['activeStage']})", file=sys.stderr)
                return False

            # Acquire lock
            new_data = {
                "activeJobId": job_id,
                "activeStage": stage,
                "startedAt": datetime.datetime.now().isoformat(),
                "status": "BUSY"
            }
            self._write_lock(new_data)
            print(f"[Resource Lock] Acquired lock for job {job_id}, stage {stage}")
            return True

    def release(self):
        with self.thread_lock:
            self.release_without_thread_lock()

    def release_without_thread_lock(self):
        new_data = {
            "activeJobId": None,
            "activeStage": None,
            "startedAt": None,
            "status": "IDLE"
        }
        self._write_lock(new_data)
        print("[Resource Lock] Released lock")
        
    def get_status(self):
        with self.thread_lock:
            return self._read_lock()

resource_lock = LocalResourceLock(config.LOCAL_WORKSPACE_ROOT)

def get_gpu_info():
    """
    Auto-detects Windows GPU configuration using wmic.
    Falls back to mock profile telemetry if unavailable.
    """
    try:
        output = subprocess.check_output(
            'wmic path win32_VideoController get name,AdapterRAM /format:csv',
            shell=True,
            stderr=subprocess.DEVNULL
        ).decode('utf-8', errors='ignore')
        
        lines = [line.strip().split(',') for line in output.split('\n') if line.strip()]
        for line in lines[1:]: # skip header
            if len(line) >= 3:
                name = line[2]
                ram_bytes = int(line[1]) if line[1].isdigit() else 0
                vram_gb = round(ram_bytes / (1024 ** 3))
                if any(x in name.lower() for x in ["nvidia", "rtx", "gtx"]):
                    return name.strip(), vram_gb
        # Fallback to first controller
        if len(lines) > 1 and len(lines[1]) >= 3:
            name = lines[1][2]
            ram_bytes = int(lines[1][1]) if lines[1][1].isdigit() else 0
            vram_gb = round(ram_bytes / (1024 ** 3))
            return name.strip(), vram_gb
    except Exception:
        pass
    return "NVIDIA GeForce RTX 4070 Laptop GPU", 8

gpu_name, vram_gb = get_gpu_info()

def heartbeat_loop():
    """
    Background daemon loop that reports worker heartbeat every 10s.
    """
    global running, active_job_id
    print(f"[{datetime.datetime.now().strftime('%T')}] Heartbeat daemon loop initiated.")
    
    # Separate connection for the heartbeat daemon
    hb_conn = None
    while running:
        try:
            if not hb_conn or hb_conn.closed:
                hb_conn = psycopg2.connect(config.DATABASE_URL)
                
            cur = hb_conn.cursor()
            now = datetime.datetime.now(datetime.timezone.utc)
            
            cur.execute("""
                INSERT INTO workers (
                    id, name, status, last_heartbeat, last_seen_at, 
                    current_job_id, gpu_name, vram_gb, mode, settings_json, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, '{}', %s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    status = EXCLUDED.status,
                    last_heartbeat = EXCLUDED.last_heartbeat,
                    last_seen_at = EXCLUDED.last_seen_at,
                    current_job_id = EXCLUDED.current_job_id,
                    gpu_name = EXCLUDED.gpu_name,
                    vram_gb = EXCLUDED.vram_gb,
                    mode = EXCLUDED.mode;
            """, (
                config.WORKER_ID,
                config.WORKER_NAME,
                "busy" if active_job_id else "online",
                now,
                now,
                active_job_id,
                gpu_name,
                vram_gb,
                "rendering" if active_job_id else "idle",
                now
            ))
            hb_conn.commit()
            cur.close()
        except Exception as e:
            print(f"Heartbeat daemon error: {e}", file=sys.stderr)
            if hb_conn:
                try:
                    hb_conn.rollback()
                except Exception:
                    pass
        time.sleep(10)
        
    # Final shutdown update to report worker offline
    try:
        print(f"[{datetime.datetime.now().strftime('%T')}] Logging worker node offline...")
        offline_conn = psycopg2.connect(config.DATABASE_URL)
        cur = offline_conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc)
        cur.execute("""
            UPDATE workers
            SET status = 'offline', mode = 'idle', last_seen_at = %s, last_heartbeat = %s, current_job_id = NULL
            WHERE id = %s;
        """, (now, now, config.WORKER_ID))
        offline_conn.commit()
        cur.close()
        offline_conn.close()
    except Exception as e:
        print(f"Failed to report offline status: {e}", file=sys.stderr)

def claim_job(conn):
    """
    Transaction-safe raw SQL claim locking the oldest queued job row.
    """
    cur = conn.cursor()
    try:
        cur.execute("BEGIN;")
        
        # Select the oldest queued job and lock the row to avoid parallel claims
        cur.execute("""
            SELECT id, project_id, settings_json FROM render_jobs
            WHERE status = 'queued'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED;
        """)
        row = cur.fetchone()
        
        if not row:
            conn.commit()
            return None
            
        job_id, project_id, settings_json = row
        
        # Update job status and set claiming worker
        cur.execute("""
            UPDATE render_jobs
            SET status = 'claimed', worker_id = %s
            WHERE id = %s;
        """, (config.WORKER_ID, job_id))
        
        # Add claim event to job_events
        event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
        event_message = f"Render job claimed by workstation worker node: {config.WORKER_ID}"
        cur.execute("""
            INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
            VALUES (%s, %s, 'claimed', %s, '{}', %s);
        """, (event_id, job_id, event_message, datetime.datetime.now(datetime.timezone.utc)))
        
        conn.commit()
        return {
            "id": job_id,
            "project_id": project_id,
            "settings_json": settings_json
        }
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()

def process_job(conn, job):
    """
    Validates job settings against capacity guardrails, applies downshift
    adjustments, then executes simulated rendering loops and logs progress
    details to Neon.
    """
    global active_job_id, running
    job_id = job["id"]
    project_id = job["project_id"]
    raw_settings = job.get("settings_json", "{}")
    active_job_id = job_id

    # Apply capacity guardrails before processing
    clamped_settings, adjustments = downshift_job_settings(raw_settings, capacity_profile)

    if adjustments:
        print(f"[{datetime.datetime.now().strftime('%T')}] Capacity adjustments applied for job {job_id}:")
        for adj in adjustments:
            print(f"  -> {adj}")

    # If the job requires features the laptop profile cannot handle, flag it
    if requires_review(adjustments):
        print(f"[{datetime.datetime.now().strftime('%T')}] Job {job_id} flagged as needs_review due to unsupported features.")
        cur = conn.cursor()
        try:
            review_message = " | ".join(a for a in adjustments if a.startswith("[NEEDS_REVIEW]"))
            cur.execute("""
                UPDATE render_jobs
                SET status = 'needs_review', error_message = %s
                WHERE id = %s;
            """, (review_message, job_id))

            event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
            cur.execute("""
                INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                VALUES (%s, %s, 'needs_review', %s, %s, %s);
            """, (
                event_id, job_id,
                f"Job flagged for review: {review_message}",
                json.dumps({"adjustments": adjustments, "clamped_settings": clamped_settings}),
                datetime.datetime.now(datetime.timezone.utc)
            ))
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"Failed to flag job for review: {e}", file=sys.stderr)
        finally:
            cur.close()
            active_job_id = None
        return

    # Log downshift adjustments as a job event if any were applied
    if adjustments:
        cur_adj = conn.cursor()
        try:
            event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
            cur_adj.execute("""
                INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                VALUES (%s, %s, 'downshifted', %s, %s, %s);
            """, (
                event_id, job_id,
                f"Job settings downshifted to fit laptop capacity profile.",
                json.dumps({"adjustments": adjustments, "clamped_settings": clamped_settings}),
                datetime.datetime.now(datetime.timezone.utc)
            ))
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"Failed to log downshift event: {e}", file=sys.stderr)
        finally:
            cur_adj.close()
    
    print(f"[{datetime.datetime.now().strftime('%T')}] Processing Render Job: {job_id} for Project: {project_id}")
    
    cur = conn.cursor()
    try:
        # Start processing state
        cur.execute("""
            UPDATE render_jobs
            SET status = 'processing', progress = 0
            WHERE id = %s;
        """, (job_id,))
        
        event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
        cur.execute("""
            INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
            VALUES (%s, %s, 'processing', 'Render job processing initiated by laptop worker.', '{}', %s);
        """, (event_id, job_id, datetime.datetime.now(datetime.timezone.utc)))
        conn.commit()

        # 1. Fetch user_id of the project
        cur.execute("SELECT user_id FROM projects WHERE id = %s LIMIT 1;", (project_id,))
        user_row = cur.fetchone()
        user_id = user_row[0] if user_row and user_row[0] else "default-user"

        # 2. Fetch the latest input reference image from project_files
        cur.execute("""
            SELECT file_url FROM project_files 
            WHERE project_id = %s AND file_type LIKE 'image/%'
            ORDER BY created_at DESC 
            LIMIT 1;
        """, (project_id,))
        file_row = cur.fetchone()
        if not file_row:
            # Fall back to any file type if no specific image type is marked
            cur.execute("""
                SELECT file_url FROM project_files 
                WHERE project_id = %s 
                ORDER BY created_at DESC 
                LIMIT 1;
            """, (project_id,))
            file_row = cur.fetchone()
            
        if not file_row:
            raise ValueError(f"No input reference image found for project: {project_id}")
            
        file_url = file_row[0]

        # 3. Retrieve style preference template
        style_id = None
        style_pref = clamped_settings.get("stylePreference")
        prompt_text = clamped_settings.get("prompt")
        negative_prompt_text = clamped_settings.get("negativePrompt") or clamped_settings.get("negative_prompt", "")
        
        if not prompt_text:
            prompt_text = "high quality architectural rendering, photorealistic, natural lighting, detailed materials"
            
        if style_pref:
            cur.execute("""
                SELECT id, prompt_template, negative_prompt 
                FROM styles 
                WHERE name = %s OR id = %s 
                LIMIT 1;
            """, (style_pref, style_pref))
            style_row = cur.fetchone()
            if style_row:
                style_id, prompt_template, style_neg = style_row
                if not clamped_settings.get("prompt"):
                    prompt_text = prompt_template
                if not negative_prompt_text and style_neg:
                    negative_prompt_text = style_neg

        # 4. Create local job workspace
        workspace_dir = os.path.join(config.LOCAL_WORKSPACE_ROOT, "jobs", job_id)
        os.makedirs(workspace_dir, exist_ok=True)

        # 5. Download the input reference image from object storage
        local_input_filename = f"input_{os.path.basename(file_url)}"
        local_input_path = os.path.join(workspace_dir, local_input_filename)
        
        print(f"[{datetime.datetime.now().strftime('%T')}] Downloading input image from S3: {file_url} -> {local_input_path}")
        downloadFileToWorker(file_url, local_input_path)

        # Acquire lock for CONTROL_MAP_PREPROCESSING
        if config.LOCAL_RESOURCE_LOCK_ENABLED:
            acquired = False
            while not acquired:
                if not running:
                    raise KeyboardInterrupt("Termination signal received while waiting for lock")
                acquired = resource_lock.acquire(job_id, "CONTROL_MAP_PREPROCESSING")
                if not acquired:
                    time.sleep(2)

        # 5b. Generate Canny edge control map locally, upload, and register
        local_control_path = None
        s3_control_key = None
        
        try:
            from PIL import Image, ImageFilter
            local_control_filename = f"canny_{os.path.basename(file_url)}"
            if not local_control_filename.lower().endswith(".png"):
                local_control_filename += ".png"
            local_control_path = os.path.join(workspace_dir, local_control_filename)
            
            print(f"[{datetime.datetime.now().strftime('%T')}] Generating lightweight Canny edge control map locally...")
            with Image.open(local_input_path) as img:
                gray = img.convert("L")
                blurred = gray.filter(ImageFilter.GaussianBlur(radius=1.2))
                edges = blurred.filter(ImageFilter.FIND_EDGES)
                # Binary thresholding for clean black & white mask
                crisp_edges = edges.point(lambda p: 255 if p > 25 else 0)
                final_control = crisp_edges.convert("RGB")
                final_control.save(local_control_path, "PNG")
                
            print(f"[{datetime.datetime.now().strftime('%T')}] Canny edge map generated: {local_control_path}")
            
            # Upload control map to object storage
            timestamp_sec = int(time.time())
            s3_control_key = f"users/{user_id}/projects/{project_id}/previews/canny_{job_id}_{timestamp_sec}.png"
            print(f"[{datetime.datetime.now().strftime('%T')}] Uploading control map to S3: {s3_control_key}")
            uploadFileFromWorker(local_control_path, s3_control_key)
            
            # Register in project_files database
            file_id = f"file_{int(time.time() * 1000)}_{random.randint(0, 999)}"
            metadata_json = json.dumps({
                "size": f"{(os.path.getsize(local_control_path) / 1024):.2f} KB",
                "uploadedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "role": "control_map",
                "preprocessor": "canny",
                "sourceJobId": job_id
            })
            
            cur_file = conn.cursor()
            try:
                cur_file.execute("""
                    INSERT INTO project_files (id, project_id, file_url, file_type, metadata_json, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """, (
                    file_id,
                    project_id,
                    s3_control_key,
                    "image/png",
                    metadata_json,
                    datetime.datetime.now(datetime.timezone.utc)
                ))
                
                # Log preprocessing job event
                event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                cur_file.execute("""
                    INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                    VALUES (%s, %s, 'preprocessing', %s, %s, %s);
                """, (
                    event_id,
                    job_id,
                    "preprocessing",
                    "Canny edge control map preprocessed locally and saved.",
                    json.dumps({"fileId": file_id, "s3Key": s3_control_key}),
                    datetime.datetime.now(datetime.timezone.utc)
                ))
                conn.commit()
                print(f"[{datetime.datetime.now().strftime('%T')}] Registered control map in DB: {file_id}")
            except Exception as db_err:
                conn.rollback()
                print(f"Failed to save control map metadata to database: {db_err}", file=sys.stderr)
            finally:
                cur_file.close()
                
        except Exception as preprocess_err:
            print(f"Failed to preprocess control map: {preprocess_err}", file=sys.stderr)
            local_control_path = None
            s3_control_key = None

        # Release lock for CONTROL_MAP_PREPROCESSING
        if config.LOCAL_RESOURCE_LOCK_ENABLED:
            resource_lock.release()

        # 6. Read image dimensions to cap them safely
        width = 768
        height = 768
        try:
            from PIL import Image
            with Image.open(local_input_path) as img:
                orig_width, orig_height = img.size
                width, height = orig_width, orig_height
        except Exception as img_err:
            print(f"Failed to read image dimensions: {img_err}. Using 768px default limit.", file=sys.stderr)

        # Clamp dimensions preserving aspect ratio to fit within capacity limit
        max_res = capacity_profile.get("max_preview_resolution", 768)
        if width > max_res or height > max_res:
            if width >= height:
                height = int(height * (max_res / width))
                width = max_res
            else:
                width = int(width * (max_res / height))
                height = max_res

        # Ensure dimensions are multiples of 8 (standard Latent VAE constraint)
        width = (width // 8) * 8
        height = (height // 8) * 8

        # Acquire lock for COMFY_RUNNING
        if config.LOCAL_RESOURCE_LOCK_ENABLED:
            acquired = False
            while not acquired:
                if not running:
                    raise KeyboardInterrupt("Termination signal received while waiting for lock")
                acquired = resource_lock.acquire(job_id, "COMFY_RUNNING")
                if not acquired:
                    time.sleep(2)

        # 7. Initialize ComfyUI client and upload input image & control map
        print(f"[{datetime.datetime.now().strftime('%T')}] Initializing ComfyUI client at {config.COMFYUI_URL}...")
        comfy_client = ComfyUIClient(config.COMFYUI_URL)
        comfy_client.check_health()
        
        print(f"[{datetime.datetime.now().strftime('%T')}] Uploading input image to ComfyUI...")
        comfyui_input_name = comfy_client.upload_image(local_input_path)
        
        comfyui_control_name = None
        if local_control_path:
            try:
                print(f"[{datetime.datetime.now().strftime('%T')}] Uploading control map image to ComfyUI...")
                comfyui_control_name = comfy_client.upload_image(local_control_path)
            except Exception as comfy_upload_err:
                print(f"Failed to upload control map to ComfyUI: {comfy_upload_err}", file=sys.stderr)

        # 8. Render variations sequentially
        variations = clamped_settings.get("variations", 2)
        if not variations or variations <= 0:
            variations = 2
            
        max_vars = capacity_profile.get("max_variations_per_job", 4)
        if variations > max_vars:
            variations = max_vars
            
        steps = clamped_settings.get("steps", 20)
        cfg_scale = clamped_settings.get("cfg_scale", 7.0)
        
        # Resolve geometry lock mode and map to denoise
        geometry_lock_mode = (clamped_settings.get("geometryLockMode") or clamped_settings.get("geometry_lock_mode") or "accurate").lower()
        mode_denoise_map = {
            "creative": 0.85,
            "balanced": 0.65,
            "accurate": 0.50,
            "technical": 0.30
        }
        
        # Override denoise based on mode if it matches default or isn't specified
        denoise = clamped_settings.get("denoise")
        if denoise is None or denoise == 0.65 or denoise == 0.50 or denoise == 0.70 or denoise == 0.55:
            denoise = mode_denoise_map.get(geometry_lock_mode, 0.50)
            
        clamped_settings["denoise"] = denoise
        clamped_settings["geometryLockMode"] = geometry_lock_mode
        
        print(f"[{datetime.datetime.now().strftime('%T')}] Launching sequential variation loops ({variations} total)...")
        
        for idx in range(variations):
            if not running:
                raise KeyboardInterrupt("Termination signal received during rendering")
                
            variation_progress_start = int((idx / variations) * 90)
            variation_progress_end = int(((idx + 1) / variations) * 90)
            
            def on_comfyui_progress(current, total):
                if total > 0:
                    prog_percent = variation_progress_start + int((current / total) * (variation_progress_end - variation_progress_start))
                    prog_percent = min(max(prog_percent, 0), 99)
                    
                    cur_prog = conn.cursor()
                    try:
                        cur_prog.execute("UPDATE render_jobs SET progress = %s WHERE id = %s;", (prog_percent, job_id))
                        conn.commit()
                    except Exception:
                        conn.rollback()
                    finally:
                        cur_prog.close()

            v_seed = clamped_settings.get("seed", random.randint(1, 1000000000)) + idx
            print(f"[{datetime.datetime.now().strftime('%T')}] Rendering variation {idx + 1}/{variations} with seed {v_seed}")
            
            output_paths = comfy_client.render(
                template_name="img2img_default",
                input_image=comfyui_input_name,
                prompt=prompt_text,
                negative_prompt=negative_prompt_text,
                seed=v_seed,
                output_folder=f"RenderPilot_{job_id}_var_{idx}",
                width=width,
                height=height,
                steps=steps,
                cfg_scale=cfg_scale,
                denoise=denoise,
                geometry_lock_mode=geometry_lock_mode,
                control_image=comfyui_control_name,
                on_progress=on_comfyui_progress
            )
            
            if not output_paths:
                raise ComfyUIExecutionError(f"No output image returned from ComfyUI for variation {idx}")
                
            comfyui_output_path = output_paths[0]
            local_output_filename = f"output_var_{idx}.png"
            local_output_path = os.path.join(workspace_dir, local_output_filename)
            
            # Download completed render image
            filename_only = os.path.basename(comfyui_output_path)
            print(f"[{datetime.datetime.now().strftime('%T')}] Fetching variation output from ComfyUI API: {filename_only}")
            output_bytes = comfy_client.download_output(filename_only)
            
            with open(local_output_path, 'wb') as f_out:
                f_out.write(output_bytes)
                
            # Upload render output to object storage
            timestamp_sec = int(time.time())
            s3_output_key = f"users/{user_id}/projects/{project_id}/outputs/render_{job_id}_var_{idx}_{timestamp_sec}.png"
            
            print(f"[{datetime.datetime.now().strftime('%T')}] Uploading variation {idx + 1} to S3: {s3_output_key}")
            uploadFileFromWorker(local_output_path, s3_output_key)
            
            # Save render metadata row in Neon
            render_id = f"render_{int(time.time() * 1000)}_{random.randint(0, 999)}"
            cur.execute("""
                INSERT INTO renders (
                    id, job_id, project_id, base_image_url, final_image_url, 
                    style_id, prompt, negative_prompt, seed, settings_json, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """, (
                render_id,
                job_id,
                project_id,
                file_url,
                s3_output_key,
                style_id,
                prompt_text,
                negative_prompt_text,
                v_seed,
                json.dumps(clamped_settings),
                datetime.datetime.now(datetime.timezone.utc)
            ))
            
            # Log transition event log
            event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
            cur.execute("""
                INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                VALUES (%s, %s, 'processing', %s, '{}', %s);
            """, (
                event_id, 
                job_id, 
                f"Variation {idx + 1}/{variations} completed and uploaded successfully.", 
                datetime.datetime.now(datetime.timezone.utc)
            ))
            conn.commit()

        # Update final job state as completed
        cur.execute("""
            UPDATE render_jobs
            SET status = 'completed', progress = 100, completed_at = %s
            WHERE id = %s;
        """, (datetime.datetime.now(datetime.timezone.utc), job_id))
        
        event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
        cur.execute("""
            INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
            VALUES (%s, %s, 'completed', 'Render variations execution completed. All outputs registered.', '{}', %s);
        """, (event_id, job_id, datetime.datetime.now(datetime.timezone.utc)))
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        print(f"[{datetime.datetime.now().strftime('%T')}] Job {job_id} encountered execution error: {e}", file=sys.stderr)
        
        try:
            cur.execute("""
                UPDATE render_jobs
                SET status = 'failed', error_message = %s, completed_at = %s
                WHERE id = %s;
            """, (str(e), datetime.datetime.now(datetime.timezone.utc), job_id))
            
            event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
            cur.execute("""
                INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                VALUES (%s, %s, 'failed', %s, '{}', %s);
            """, (event_id, job_id, f"Render execution failed: {e}", datetime.datetime.now(datetime.timezone.utc)))
            conn.commit()
        except Exception as log_err:
            print(f"Failed to log job failure details: {log_err}", file=sys.stderr)
            conn.rollback()
    finally:
        cur.close()
        active_job_id = None
        if config.LOCAL_RESOURCE_LOCK_ENABLED:
            resource_lock.release()

def handle_shutdown(signum, frame):
    """
    Registers termination handlers to shut down threads cleanly.
    """
    global running
    print(f"\n[{datetime.datetime.now().strftime('%T')}] Graceful shutdown trigger caught. Terminating loops...")
    running = False

# Bind signal handlers for Ctrl+C and SIGTERM
signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

def main():
    global running
    print("==================================================")
    print("        RenderPilot Laptop Worker Node started     ")
    print("==================================================")
    print(f"Worker ID:     {config.WORKER_ID}")
    print(f"Worker Name:   {config.WORKER_NAME}")
    print(f"GPU Model:     {gpu_name}")
    print(f"VRAM Capacity: {vram_gb} GB")
    print("--------------------------------------------------")
    print("Capacity Guardrails (Laptop Profile):")
    print(f"  Max Concurrent Jobs:    {capacity_profile['max_concurrent_jobs']}")
    print(f"  Max Preview Resolution: {capacity_profile['max_preview_resolution']}px")
    print(f"  Max Variations/Job:     {capacity_profile['max_variations_per_job']}")
    print(f"  Sequential Variations:  {capacity_profile['sequential_variations']}")
    print(f"  SDXL Enabled:           {capacity_profile['sdxl_enabled']}")
    print(f"  Video Enabled:          {capacity_profile['video_enabled']}")
    print(f"  Parallel ComfyUI:       {capacity_profile['parallel_comfyui_jobs']}")
    print(f"  Upscale Approved Only:  {capacity_profile['upscale_approved_only']}")
    print("--------------------------------------------------")
    
    # Spawn the background heartbeat reporting thread
    hb_thread = threading.Thread(target=heartbeat_loop, daemon=True)
    hb_thread.start()
    
    conn = None
    while running:
        try:
            if not conn or conn.closed:
                print(f"[{datetime.datetime.now().strftime('%T')}] Connecting to Neon database...")
                conn = psycopg2.connect(config.DATABASE_URL)
                print(f"[{datetime.datetime.now().strftime('%T')}] Connected successfully.")
                
            # Enforce max_concurrent_jobs = 1; never claim while busy
            if active_job_id:
                time.sleep(2)
                continue

            # Check if local resource lock is busy (e.g. from another process on this machine)
            if config.LOCAL_RESOURCE_LOCK_ENABLED:
                lock_status = resource_lock.get_status()
                if lock_status["status"] == "BUSY":
                    time.sleep(2)
                    continue

            # Attempt to claim a queued job
            job = claim_job(conn)
            if job:
                # Execute the claimed job
                process_job(conn, job)
            else:
                # Sleep briefly between queries if queue is empty
                time.sleep(4)
                
        except psycopg2.OperationalError as db_err:
            print(f"Database operational connection error: {db_err}. Retrying in 5s...", file=sys.stderr)
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
                conn = None
            time.sleep(5)
        except Exception as err:
            print(f"Unexpected loop exception: {err}. Continuing...", file=sys.stderr)
            time.sleep(4)
            
    # Cleanup main connections
    if conn:
        try:
            conn.close()
        except Exception:
            pass
            
    print(f"[{datetime.datetime.now().strftime('%T')}] Worker shutdown successfully complete. Goodbye.")

if __name__ == '__main__':
    main()
