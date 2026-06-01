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

# Control flag for grace shutdown handling
running = True
active_job_id = None
worker_state = {
    "status": "online",
    "mode": "idle"
}

# Load capacity profile (uses LAPTOP_PROFILE defaults)
capacity_profile = load_profile()

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
        
        # Simulate rendering chunks
        for progress in [20, 40, 60, 80]:
            if not running:
                raise KeyboardInterrupt("Termination signal received during rendering")
                
            time.sleep(1.5)
            print(f"[{datetime.datetime.now().strftime('%T')}] Render progress updated to: {progress}%")
            
            cur.execute("""
                UPDATE render_jobs
                SET progress = %s
                WHERE id = %s;
            """, (progress, job_id))
            
            event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
            cur.execute("""
                INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                VALUES (%s, %s, 'processing', %s, '{}', %s);
            """, (event_id, job_id, f"Render execution details: {progress}% completed.", datetime.datetime.now(datetime.timezone.utc)))
            conn.commit()
            
        # Completion outputs registration
        time.sleep(1.5)
        print(f"[{datetime.datetime.now().strftime('%T')}] Render execution completed. Registering outputs...")
        
        render_id = f"render_{int(time.time() * 1000)}_{random.randint(0, 999)}"
        mock_final_image = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c"
        cur.execute("""
            INSERT INTO renders (id, job_id, project_id, final_image_url, prompt, negative_prompt, seed, settings_json, created_at)
            VALUES (%s, %s, %s, %s, 'High-resolution architectural visual rendering pass', '', 424242, '{}', %s);
        """, (render_id, job_id, project_id, mock_final_image, datetime.datetime.now(datetime.timezone.utc)))
        
        cur.execute("""
            UPDATE render_jobs
            SET status = 'completed', progress = 100, completed_at = %s
            WHERE id = %s;
        """, (datetime.datetime.now(datetime.timezone.utc), job_id))
        
        event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
        cur.execute("""
            INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
            VALUES (%s, %s, 'completed', 'Render outputs saved and job execution complete.', '{}', %s);
        """, (event_id, job_id, datetime.datetime.now(datetime.timezone.utc)))
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        print(f"[{datetime.datetime.now().strftime('%T')}] Job {job_id} encountered execution error: {e}", file=sys.stderr)
        
        # Log failure updates safely
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
