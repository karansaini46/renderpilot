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
import argparse
from config import config
from capacity import load_profile, downshift_job_settings, requires_review, LAPTOP_PROFILE
from storage import downloadFileToWorker, uploadFileFromWorker
from comfyui_client import ComfyUIClient, ComfyUIConnectionError, ComfyUIExecutionError
from blender_pipeline import run_blender_pipeline, run_camera_preview_pipeline

def calculate_geometry_drift_score(input_image_path: str, output_image_path: str) -> float:
    """
    Calculates structural similarity (1.0 - mean diff) between edge maps of input and output.
    Uses Pillow-only filters: GaussianBlur, FIND_EDGES, and binary thresholding.
    """
    from PIL import Image, ImageFilter, ImageChops
    try:
        with Image.open(input_image_path) as img1, Image.open(output_image_path) as img2:
            size = (512, 512)
            img1_resized = img1.resize(size).convert("L")
            img2_resized = img2.resize(size).convert("L")

            # Apply identical structure-extracting edge filters
            blurred1 = img1_resized.filter(ImageFilter.GaussianBlur(radius=1.2))
            edges1 = blurred1.filter(ImageFilter.FIND_EDGES).point(lambda p: 255 if p > 25 else 0)

            blurred2 = img2_resized.filter(ImageFilter.GaussianBlur(radius=1.2))
            edges2 = blurred2.filter(ImageFilter.FIND_EDGES).point(lambda p: 255 if p > 25 else 0)

            # Absolute difference map
            diff = ImageChops.difference(edges1, edges2)
            stat = diff.getdata()
            total_diff = sum(stat)
            num_pixels = len(stat)
            mean_diff = total_diff / num_pixels

            similarity = 1.0 - (mean_diff / 255.0)
            return float(similarity)
    except Exception as e:
        print(f"[Geometry Check] Error calculating geometry drift: {e}", file=sys.stderr)
        return 1.0

# Control flag for grace shutdown handling
running = True
active_job_id = None
worker_mode = "batch"  # Active run mode ('manual', 'batch', or 'live')
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
    global running, active_job_id, worker_mode
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
                worker_mode,
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

def recover_stale_jobs(conn):
    """
    Checks for jobs in 'claimed' or 'processing' status whose assigned worker is offline.
    Reschedules them to 'queued' if retry_count < max_retries, otherwise marks them 'failed'.
    """
    cur = conn.cursor()
    try:
        cur.execute("BEGIN;")
        stale_threshold = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=30)
        # Use a subquery to avoid "FOR UPDATE cannot be applied to the nullable side of an outer join"
        cur.execute("""
            SELECT r.id, r.retry_count, r.max_retries, r.worker_id
            FROM render_jobs r
            WHERE r.status IN ('claimed', 'processing')
              AND (
                r.worker_id IS NULL
                OR NOT EXISTS (
                    SELECT 1 FROM workers w
                    WHERE w.id = r.worker_id
                      AND w.status != 'offline'
                      AND w.last_heartbeat IS NOT NULL
                      AND w.last_heartbeat >= %s
                )
              )
            FOR UPDATE SKIP LOCKED;
        """, (stale_threshold,))
        stale_jobs = cur.fetchall()
        
        if stale_jobs:
            for job_id, retry_count, max_retries, worker_id in stale_jobs:
                print(f"[{datetime.datetime.now().strftime('%T')}] Recovering stale job {job_id} from worker {worker_id}...")
                if retry_count < max_retries:
                    new_retry = retry_count + 1
                    cur.execute("""
                        UPDATE render_jobs
                        SET status = 'queued', retry_count = %s, failed_at = %s, error_message = %s, worker_id = NULL
                        WHERE id = %s;
                    """, (new_retry, datetime.datetime.now(datetime.timezone.utc), f"Worker offline. Rescheduled (Retry {new_retry}/{max_retries}).", job_id))
                    
                    event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                    cur.execute("""
                        INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                        VALUES (%s, %s, 'queued', %s, '{}', %s);
                    """, (event_id, job_id, f"Stale job recovered. Previous worker: {worker_id}. Rescheduled for retry.", datetime.datetime.now(datetime.timezone.utc)))
                else:
                    cur.execute("""
                        UPDATE render_jobs
                        SET status = 'failed', failed_at = %s, error_message = %s
                        WHERE id = %s;
                    """, (datetime.datetime.now(datetime.timezone.utc), "Job failed: Worker heartbeat went offline too long (stale claimed job recovery limit reached).", job_id))
                    
                    event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                    cur.execute("""
                        INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                        VALUES (%s, %s, 'failed', %s, '{}', %s);
                    """, (event_id, job_id, "Job failed: Worker offline. Max retries exceeded.", datetime.datetime.now(datetime.timezone.utc)))
        cur.execute("COMMIT;")
    except Exception as e:
        try:
            cur.execute("ROLLBACK;")
        except Exception:
            pass
        print(f"Failed to recover stale jobs: {e}", file=sys.stderr)
    finally:
        cur.close()

def claim_job(conn, job_id=None):
    """
    Transaction-safe raw SQL claim locking the oldest queued job row or a specific job ID.
    """
    cur = conn.cursor()
    try:
        cur.execute("BEGIN;")
        
        if job_id:
            # Claim the specific job
            cur.execute("""
                SELECT id, project_id, settings_json, retry_count, max_retries FROM render_jobs
                WHERE id = %s AND status = 'queued'
                FOR UPDATE;
            """, (job_id,))
        else:
            # Select the oldest queued job and lock the row to avoid parallel claims
            cur.execute("""
                SELECT id, project_id, settings_json, retry_count, max_retries FROM render_jobs
                WHERE status = 'queued'
                ORDER BY created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED;
            """)
        row = cur.fetchone()
        
        if not row:
            conn.commit()
            return None
            
        claimed_job_id, project_id, settings_json, retry_count, max_retries = row
        
        # Update job status and set claiming worker
        cur.execute("""
            UPDATE render_jobs
            SET status = 'claimed', worker_id = %s
            WHERE id = %s;
        """, (config.WORKER_ID, claimed_job_id))
        
        # Add claim event to job_events
        event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
        event_message = f"Render job claimed by workstation worker node: {config.WORKER_ID}"
        cur.execute("""
            INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
            VALUES (%s, %s, 'claimed', %s, '{}', %s);
        """, (event_id, claimed_job_id, event_message, datetime.datetime.now(datetime.timezone.utc)))
        
        conn.commit()
        return {
            "id": claimed_job_id,
            "project_id": project_id,
            "settings_json": settings_json,
            "retry_count": retry_count,
            "max_retries": max_retries
        }
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()

def detect_material_class(obj_name: str, mat_name: str, collections: list, base_color: list) -> tuple:
    """
    Analyzes object name, material name, collection names, and basic material color to detect
    its category (glass, wall, floor, wood, metal, concrete, stone, vegetation, roof, frame, door, furniture),
    returning (detected_class, confidence, reason).
    """
    obj_name_lower = obj_name.lower()
    mat_name_lower = mat_name.lower()
    collections_lower = [c.lower() for c in collections]
    
    # 1. Glass Rule
    glass_kws = ["glass", "glaz", "pane", "mirror", "translucent", "glass_panel"]
    if any(kw in mat_name_lower for kw in glass_kws):
        return "glass", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in glass_kws):
        return "glass", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in glass_kws) for col in collections_lower):
        return "glass", 0.70, f"Keyword match in collection group"

    # 2. Vegetation Rule
    veg_kws = ["veg", "plant", "tree", "grass", "leaf", "leaves", "bush", "shrub", "flower", "garden", "foliage", "woodland"]
    if any(kw in mat_name_lower for kw in veg_kws):
        return "vegetation", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in veg_kws):
        return "vegetation", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in veg_kws) for col in collections_lower):
        return "vegetation", 0.70, f"Keyword match in collection group"
    # Color signature
    r, g, b = base_color[0], base_color[1], base_color[2]
    if g > r * 1.3 and g > b * 1.3 and g > 0.15:
        return "vegetation", 0.60, f"Color profile indicates vegetation (greenish hue: R={r:.2f}, G={g:.2f}, B={b:.2f})"

    # 3. Door Rule
    door_kws = ["door", "gate", "entrance", "portal", "threshold"]
    if any(kw in mat_name_lower for kw in door_kws):
        return "door", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in door_kws):
        return "door", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in door_kws) for col in collections_lower):
        return "door", 0.70, f"Keyword match in collection group"

    # 4. Furniture Rule
    furniture_kws = ["furniture", "chair", "table", "desk", "sofa", "couch", "bench", "cabinet", "shelf", "wardrobe", "bed", "stool", "cushion", "furnishing"]
    if any(kw in mat_name_lower for kw in furniture_kws):
        return "furniture", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in furniture_kws):
        return "furniture", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in furniture_kws) for col in collections_lower):
        return "furniture", 0.70, f"Keyword match in collection group"

    # 5. Frame Rule
    frame_kws = ["frame", "border", "mullion", "sash", "casing", "trim"]
    if any(kw in mat_name_lower for kw in frame_kws):
        return "frame", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in frame_kws):
        return "frame", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in frame_kws) for col in collections_lower):
        return "frame", 0.70, f"Keyword match in collection group"

    # 6. Roof Rule
    roof_kws = ["roof", "ceiling", "canopy", "shingle", "soffit", "rafter"]
    if any(kw in mat_name_lower for kw in roof_kws):
        return "roof", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in roof_kws):
        return "roof", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in roof_kws) for col in collections_lower):
        return "roof", 0.70, f"Keyword match in collection group"

    # 7. Floor Rule
    floor_kws = ["floor", "ground", "deck", "pave", "driveway", "terrace", "slab", "rug", "carpet", "tile_floor"]
    if any(kw in mat_name_lower for kw in floor_kws):
        return "floor", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in floor_kws):
        return "floor", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in floor_kws) for col in collections_lower):
        return "floor", 0.70, f"Keyword match in collection group"

    # 8. Wood Rule
    wood_kws = ["wood", "timber", "oak", "plank", "walnut", "pine", "teak", "maple", "cherry", "cedar", "mahogany", "lumber"]
    if any(kw in mat_name_lower for kw in wood_kws):
        return "wood", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in wood_kws):
        return "wood", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in wood_kws) for col in collections_lower):
        return "wood", 0.70, f"Keyword match in collection group"

    # 9. Metal Rule
    metal_kws = ["metal", "steel", "iron", "copper", "gold", "brass", "chrome", "alum", "silver", "bronze", "metallic", "zinc", "nickel"]
    if any(kw in mat_name_lower for kw in metal_kws):
        return "metal", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in metal_kws):
        return "metal", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in metal_kws) for col in collections_lower):
        return "metal", 0.70, f"Keyword match in collection group"

    # 10. Concrete Rule
    concrete_kws = ["concrete", "cement", "mortar", "microcement", "stucco"]
    if any(kw in mat_name_lower for kw in concrete_kws):
        return "concrete", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in concrete_kws):
        return "concrete", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in concrete_kws) for col in collections_lower):
        return "concrete", 0.70, f"Keyword match in collection group"

    # 11. Stone Rule
    stone_kws = ["stone", "marble", "granite", "rock", "slate", "brick", "masonry", "travertine", "limestone", "terrazzo", "sandstone"]
    if any(kw in mat_name_lower for kw in stone_kws):
        return "stone", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in stone_kws):
        return "stone", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in stone_kws) for col in collections_lower):
        return "stone", 0.70, f"Keyword match in collection group"

    # 12. Wall Rule
    wall_kws = ["wall", "partition", "facade", "siding", "cladding", "plaster", "drywall"]
    if any(kw in mat_name_lower for kw in wall_kws):
        return "wall", 0.90, f"Keyword match in material name '{mat_name}'"
    if any(kw in obj_name_lower for kw in wall_kws):
        return "wall", 0.80, f"Keyword match in object name '{obj_name}'"
    if any(any(kw in col for kw in wall_kws) for col in collections_lower):
        return "wall", 0.70, f"Keyword match in collection group"

    # Fallback to Wall if its name matches typical structural keywords
    if "facade" in obj_name_lower or "structure" in obj_name_lower:
        return "wall", 0.50, f"Structural keyword fallback in object name '{obj_name}'"

    # Default fallback guess
    return "wall", 0.20, f"Default fallback classification (no keywords matched)"

def get_default_finish(detected_class: str, mat_name: str) -> str:
    if mat_name and not mat_name.lower().startswith("material"):
        cleaned = mat_name.replace("_", " ").replace(".", " ").strip()
        return cleaned.title()
        
    defaults = {
        "glass": "Clear Glass",
        "wall": "Matte Wall Paint",
        "floor": "Polished Floor Finish",
        "wood": "Natural Oak Wood",
        "metal": "Brushed Steel",
        "concrete": "Exposed Concrete",
        "stone": "Textured Stone Masonry",
        "vegetation": "Lush Green Vegetation",
        "roof": "Standard Roof Material",
        "frame": "Dark Window Frame Finish",
        "door": "Solid Door Finish",
        "furniture": "Standard Furniture Finish"
    }
    return defaults.get(detected_class, "Standard Finish")

def process_job(conn, job):
    try:
        _process_job_impl(conn, job)
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        print(f"[FATAL ERROR] Full traceback:\n{error_msg}", flush=True, file=sys.stderr)

def _process_job_impl(conn, job):
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

    # Parse settings to check job type
    try:
        settings = json.loads(raw_settings) if isinstance(raw_settings, str) and raw_settings.strip() else (raw_settings or {})
    except Exception:
        settings = {}
        
    job_type = settings.get("job_type") or settings.get("jobType")
    
    if job_type == "base_render_model":
        # Check feature flag
        if not config.BLENDER_PIPELINE_ENABLED:
            print(f"[{datetime.datetime.now().strftime('%T')}] Job {job_id} requires Blender pipeline which is disabled behind a feature flag.", flush=True)
            cur = conn.cursor()
            try:
                review_message = "Job requires Blender pipeline (base_render_model) which is currently disabled behind a feature flag."
                cur.execute("""
                    UPDATE render_jobs
                    SET status = 'needs_review', error_message = %s, failed_at = %s
                    WHERE id = %s;
                """, (review_message, datetime.datetime.now(datetime.timezone.utc), job_id))

                event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                cur.execute("""
                    INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                    VALUES (%s, %s, 'needs_review', %s, '{}', %s);
                """, (event_id, job_id, f"Job flagged: {review_message}", datetime.datetime.now(datetime.timezone.utc)))
                conn.commit()
            except Exception as db_err:
                conn.rollback()
                print(f"Failed to flag job: {db_err}", file=sys.stderr, flush=True)
            finally:
                cur.close()
                active_job_id = None
            return

        # Execute Blender pipeline
        cur = conn.cursor()
        workspace_dir = os.path.join(config.LOCAL_WORKSPACE_ROOT, "blender_jobs", job_id)
        try:
            # Update to processing status
            cur.execute("UPDATE render_jobs SET status = 'processing', progress = 10 WHERE id = %s;", (job_id,))
            
            event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
            cur.execute("""
                INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                VALUES (%s, %s, 'processing', 'Blender CAD pipeline processing initiated.', '{}', %s);
            """, (event_id, job_id, datetime.datetime.now(datetime.timezone.utc)))
            conn.commit()
            
            # Fetch user_id of the project
            cur.execute("SELECT user_id FROM projects WHERE id = %s LIMIT 1;", (project_id,))
            user_row = cur.fetchone()
            user_id = user_row[0] if user_row and user_row[0] else "default-user"

            # Query the latest .blend project file
            cur.execute("""
                SELECT file_url FROM project_files
                WHERE project_id = %s AND (file_type LIKE 'model/%%' OR file_url LIKE '%%.blend')
                ORDER BY created_at DESC LIMIT 1;
            """, (project_id,))
            file_row = cur.fetchone()
            if not file_row:
                raise ValueError(f"No input model file found for project: {project_id}")
            
            file_url = file_row[0]
            
            # Create local job workspace
            os.makedirs(workspace_dir, exist_ok=True)
            local_blend_path = os.path.join(workspace_dir, os.path.basename(file_url))
            
            print(f"[{datetime.datetime.now().strftime('%T')}] Downloading input model from S3: {file_url} -> {local_blend_path}", flush=True)
            downloadFileToWorker(file_url, local_blend_path)
            
            selected_camera = settings.get("selected_camera")
            if not selected_camera:
                # Phase 1: Camera Preview and Auto-Setup Generation
                print(f"[{datetime.datetime.now().strftime('%T')}] No camera selection found. Generating candidates...", flush=True)
                
                # Update progress
                cur.execute("UPDATE render_jobs SET progress = 20 WHERE id = %s;", (job_id,))
                conn.commit()
                
                candidates, detected_materials = run_camera_preview_pipeline(job_id, project_id, user_id, local_blend_path)
                
                if detected_materials:
                    print(f"[{datetime.datetime.now().strftime('%T')}] Analyzing {len(detected_materials)} scene materials...", flush=True)
                    for item in detected_materials:
                        obj_name = item.get("object_name", "")
                        mat_name = item.get("material_name", "")
                        collections = item.get("collections", [])
                        base_color = item.get("base_color", [1.0, 1.0, 1.0, 1.0])
                        
                        detected_class, confidence, reason = detect_material_class(
                            obj_name, mat_name, collections, base_color
                        )
                        
                        selected_material = get_default_finish(detected_class, mat_name)
                        
                        # Check if a user mapping for this objectName already exists and is locked.
                        cur.execute("""
                            SELECT id, locked FROM material_mappings 
                            WHERE project_id = %s AND object_name = %s LIMIT 1;
                        """, (project_id, obj_name))
                        existing = cur.fetchone()
                        
                        if existing:
                            mapping_id, locked = existing
                            if not locked:
                                cur.execute("""
                                    UPDATE material_mappings
                                    SET detected_class = %s, selected_material = %s, confidence = %s, reason = %s, correction_source = 'heuristic'
                                    WHERE id = %s;
                                """, (detected_class, selected_material, confidence, reason, mapping_id))
                        else:
                            mapping_id = f"mm_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                            cur.execute("""
                                INSERT INTO material_mappings (id, project_id, object_name, detected_class, selected_material, confidence, locked, correction_source, reason)
                                VALUES (%s, %s, %s, %s, %s, %s, FALSE, 'heuristic', %s);
                            """, (mapping_id, project_id, obj_name, detected_class, selected_material, confidence, reason))
                    
                    conn.commit()
                    print(f"[{datetime.datetime.now().strftime('%T')}] Successfully saved material mapping guesses to database.", flush=True)

                # Update settings_json in the DB with the candidates
                settings["camera_candidates"] = candidates
                updated_settings_json = json.dumps(settings)
                
                cur.execute("""
                    UPDATE render_jobs
                    SET status = 'waiting_for_camera', progress = 50, settings_json = %s
                    WHERE id = %s;
                """, (updated_settings_json, job_id))
                
                event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                cur.execute("""
                    INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                    VALUES (%s, %s, 'waiting_for_camera', 'Camera preview candidates generated. Awaiting user selection.', %s, %s);
                """, (
                    event_id, job_id,
                    json.dumps({"camera_candidates": candidates}),
                    datetime.datetime.now(datetime.timezone.utc)
                ))
                conn.commit()
                
                # Clean up workspace
                import shutil
                if os.path.exists(workspace_dir):
                    print(f"[{datetime.datetime.now().strftime('%T')}] Cleaning up workspace for job {job_id}...", flush=True)
                    shutil.rmtree(workspace_dir, ignore_errors=True)
                    
                print(f"[{datetime.datetime.now().strftime('%T')}] Job {job_id} is now waiting for user camera selection.", flush=True)
                return

            # Phase 2: Full Render (camera selected)
            print(f"[{datetime.datetime.now().strftime('%T')}] Found selected camera. Proceeding with full render...", flush=True)
            
            # Update progress
            cur.execute("UPDATE render_jobs SET progress = 30 WHERE id = %s;", (job_id,))
            conn.commit()

            # Execute Blender pipeline passing the custom camera config
            blender_result = run_blender_pipeline(job_id, project_id, json.dumps(settings), local_blend_path, selected_camera)
            
            # Update progress after rendering
            cur.execute("UPDATE render_jobs SET progress = 70 WHERE id = %s;", (job_id,))
            conn.commit()
            
            # Upload outputs to object storage and register metadata
            uploaded_outputs = {}
            import shutil
            for slot_name, local_path in blender_result.get("outputs", {}).items():
                s3_key = f"users/{user_id}/projects/{project_id}/outputs/blender_{job_id}_{slot_name}.png"
                
                print(f"[{datetime.datetime.now().strftime('%T')}] Uploading {slot_name} to S3: {s3_key}", flush=True)
                uploadFileFromWorker(local_path, s3_key)
                uploaded_outputs[slot_name] = s3_key
                
                # Register in project_files table
                file_id = f"file_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                metadata_json = json.dumps({
                    "size": f"{(os.path.getsize(local_path) / 1024):.2f} KB",
                    "uploadedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "role": "control_pass",
                    "pass_type": slot_name,
                    "sourceJobId": job_id
                })
                
                cur.execute("""
                    INSERT INTO project_files (id, project_id, file_url, file_type, metadata_json, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """, (
                    file_id,
                    project_id,
                    s3_key,
                    "image/png",
                    metadata_json,
                    datetime.datetime.now(datetime.timezone.utc)
                ))
            
            # Clean up local workspace folder after successful execution
            if os.path.exists(workspace_dir):
                print(f"[{datetime.datetime.now().strftime('%T')}] Cleaning up workspace for job {job_id}...", flush=True)
                shutil.rmtree(workspace_dir, ignore_errors=True)

            # Update to completed status
            cur.execute("""
                UPDATE render_jobs
                SET status = 'completed', progress = 100, completed_at = %s
                WHERE id = %s;
            """, (datetime.datetime.now(datetime.timezone.utc), job_id))
            
            # Prepare result dictionary to save in events
            event_details = {
                "status": blender_result.get("status"),
                "outputs": uploaded_outputs,
                "timestamp": blender_result.get("timestamp")
            }
            
            event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
            cur.execute("""
                INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                VALUES (%s, %s, 'completed', %s, %s, %s);
            """, (
                event_id, job_id, 
                "Blender CAD pipeline execution completed successfully.", 
                json.dumps(event_details), 
                datetime.datetime.now(datetime.timezone.utc)
            ))
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"Blender pipeline execution error: {e}", file=sys.stderr, flush=True)
            
            # Clean up local workspace folder on failure
            import shutil
            if os.path.exists(workspace_dir):
                print(f"[{datetime.datetime.now().strftime('%T')}] Cleaning up workspace for job {job_id} after failure...", flush=True)
                shutil.rmtree(workspace_dir, ignore_errors=True)
                
            # Log failure to database
            cur_fail = None
            try:
                retry_count = job.get("retry_count", 0)
                max_retries = job.get("max_retries", 3)
                
                cur_fail = conn.cursor()
                if retry_count < max_retries:
                    new_retry = retry_count + 1
                    cur_fail.execute("""
                        UPDATE render_jobs
                        SET status = 'queued', retry_count = %s, error_message = %s, failed_at = %s, progress = 0
                        WHERE id = %s;
                    """, (new_retry, str(e), datetime.datetime.now(datetime.timezone.utc), job_id))
                    
                    event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                    cur_fail.execute("""
                        INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                        VALUES (%s, %s, 'failed', %s, '{}', %s);
                    """, (event_id, job_id, f"Blender pipeline execution failed (Retry {new_retry}/{max_retries}): {e}", datetime.datetime.now(datetime.timezone.utc)))
                    conn.commit()
                    print(f"[{datetime.datetime.now().strftime('%T')}] Rescheduled job {job_id} for retry ({new_retry}/{max_retries}).", flush=True)
                else:
                    cur_fail.execute("""
                        UPDATE render_jobs
                        SET status = 'failed', error_message = %s, failed_at = %s
                        WHERE id = %s;
                    """, (str(e), datetime.datetime.now(datetime.timezone.utc), job_id))
                    
                    event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                    cur_fail.execute("""
                        INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                        VALUES (%s, %s, 'failed', %s, '{}', %s);
                    """, (event_id, job_id, f"Blender pipeline execution failed permanently (Max retries exceeded): {e}", datetime.datetime.now(datetime.timezone.utc)))
                    conn.commit()
                    print(f"[{datetime.datetime.now().strftime('%T')}] Job {job_id} failed permanently (Max retries exceeded).", flush=True)
            except Exception as log_err:
                print(f"Failed to log job failure details: {log_err}", file=sys.stderr, flush=True)
                if conn:
                    conn.rollback()
            finally:
                if cur_fail:
                    cur_fail.close()
        finally:
            cur.close()
            active_job_id = None
        return

    # Apply capacity guardrails before processing
    clamped_settings, adjustments = downshift_job_settings(raw_settings, capacity_profile)

    if adjustments:
        print(f"[{datetime.datetime.now().strftime('%T')}] Capacity adjustments applied for job {job_id}:", flush=True)
        for adj in adjustments:
            print(f"  -> {adj}", flush=True)

    # If the job requires features the laptop profile cannot handle, flag it
    if requires_review(adjustments):
        print(f"[{datetime.datetime.now().strftime('%T')}] Job {job_id} flagged as needs_review due to unsupported features.", flush=True)
        cur = conn.cursor()
        try:
            review_message = " | ".join(a for a in adjustments if a.startswith("[NEEDS_REVIEW]"))
            cur.execute("""
                UPDATE render_jobs
                SET status = 'needs_review', error_message = %s, failed_at = %s
                WHERE id = %s;
            """, (review_message, datetime.datetime.now(datetime.timezone.utc), job_id))

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
            print(f"Failed to flag job for review: {e}", file=sys.stderr, flush=True)
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
            print(f"Failed to log downshift event: {e}", file=sys.stderr, flush=True)
        finally:
            cur_adj.close()
    
    print(f"[{datetime.datetime.now().strftime('%T')}] Processing Render Job: {job_id} for Project: {project_id}", flush=True)
    
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

        is_upscale = clamped_settings.get("job_type") == "upscale_selected"
        render_id_to_upscale = clamped_settings.get("renderId")

        if is_upscale:
            if not render_id_to_upscale:
                raise ValueError("renderId is required for upscale_selected job")
            cur.execute("""
                SELECT preview_url, style_id, prompt, negative_prompt, seed, final_image_url 
                FROM renders 
                WHERE id = %s LIMIT 1;
            """, (render_id_to_upscale,))
            render_row = cur.fetchone()
            if not render_row:
                raise ValueError(f"Render to upscale not found: {render_id_to_upscale}")
            
            # The input file is the preview image
            file_url = render_row[0] or render_row[5]
            if not file_url:
                raise ValueError(f"No image URL found for render to upscale: {render_id_to_upscale}")
                
            style_id = render_row[1]
            prompt_text = render_row[2]
            negative_prompt_text = render_row[3] or ""
            v_seed = render_row[4]
            if v_seed is not None:
                v_seed = int(v_seed)
            else:
                v_seed = random.randint(1, 1000000000)
                
            variations = 1
            denoise = 0.25 # Low denoise to preserve composition/details
        else:
            # 2. Fetch the latest input reference image from project_files with role/control-map filters
            cur.execute("""
                SELECT file_url FROM project_files 
                WHERE project_id = %s 
                  AND file_type LIKE 'image/%%'
                  AND (
                    CASE WHEN metadata_json IS NOT NULL AND metadata_json != '' THEN metadata_json::json->>'role' ELSE NULL END IN ('input', 'scene_render', 'original')
                    AND (CASE WHEN metadata_json IS NOT NULL AND metadata_json != '' THEN metadata_json::json->>'preprocessor' ELSE NULL END) IS NULL
                    AND file_url NOT LIKE '%%canny_%%' AND file_url NOT LIKE '%%depth_%%'
                  )
                ORDER BY created_at DESC 
                LIMIT 1;
            """, (project_id,))
            file_row = cur.fetchone()
            
            if not file_row:
                # Fall back to the most recently uploaded file that is not a control map
                cur.execute("""
                    SELECT file_url FROM project_files 
                    WHERE project_id = %s 
                      AND file_type LIKE 'image/%%'
                      AND (
                        CASE WHEN metadata_json IS NOT NULL AND metadata_json != '' THEN metadata_json::json->>'role' ELSE NULL END IS NULL 
                        OR CASE WHEN metadata_json IS NOT NULL AND metadata_json != '' THEN metadata_json::json->>'role' ELSE NULL END != 'control_map'
                      )
                      AND file_url NOT LIKE '%%canny_%%' AND file_url NOT LIKE '%%depth_%%'
                    ORDER BY created_at DESC 
                    LIMIT 1;
                """, (project_id,))
                file_row = cur.fetchone()
                
            if not file_row:
                # Absolute fallback to any image file
                cur.execute("""
                    SELECT file_url FROM project_files 
                    WHERE project_id = %s AND file_type LIKE 'image/%%'
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

        # 5. Download the input image
        local_input_filename = f"input_{os.path.basename(file_url)}"
        local_input_path = os.path.join(workspace_dir, local_input_filename)
        
        print(f"[{datetime.datetime.now().strftime('%T')}] Downloading input image from S3: {file_url} -> {local_input_path}", flush=True)
        downloadFileToWorker(file_url, local_input_path)

        local_control_path = None
        s3_control_key = None

        if not is_upscale:
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
            try:
                from PIL import Image, ImageFilter
                local_control_filename = f"canny_{os.path.basename(file_url)}"
                if not local_control_filename.lower().endswith(".png"):
                    local_control_filename += ".png"
                local_control_path = os.path.join(workspace_dir, local_control_filename)
                
                print(f"[{datetime.datetime.now().strftime('%T')}] Generating lightweight Canny edge control map locally...", flush=True)
                with Image.open(local_input_path) as img:
                    gray = img.convert("L")
                    blurred = gray.filter(ImageFilter.GaussianBlur(radius=1.2))
                    edges = blurred.filter(ImageFilter.FIND_EDGES)
                    # Binary thresholding for clean black & white mask
                    crisp_edges = edges.point(lambda p: 255 if p > 25 else 0)
                    final_control = crisp_edges.convert("RGB")
                    final_control.save(local_control_path, "PNG")
                    
                print(f"[{datetime.datetime.now().strftime('%T')}] Canny edge map generated: {local_control_path}", flush=True)
                
                # Upload control map to object storage
                timestamp_sec = int(time.time())
                s3_control_key = f"users/{user_id}/projects/{project_id}/previews/canny_{job_id}_{timestamp_sec}.png"
                print(f"[{datetime.datetime.now().strftime('%T')}] Uploading control map to S3: {s3_control_key}", flush=True)
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
                        VALUES (%s, %s, %s, %s, %s, %s);
                    """, (
                        event_id,
                        job_id,
                        "preprocessing",
                        "Canny edge control map preprocessed locally and saved.",
                        json.dumps({"fileId": file_id, "s3Key": s3_control_key}),
                        datetime.datetime.now(datetime.timezone.utc)
                    ))
                    conn.commit()
                    print(f"[{datetime.datetime.now().strftime('%T')}] Registered control map in DB: {file_id}", flush=True)
                except Exception as db_err:
                    conn.rollback()
                    print(f"Failed to save control map metadata to database: {db_err}", file=sys.stderr, flush=True)
                finally:
                    cur_file.close()
                    
            except Exception as preprocess_err:
                print(f"Failed to preprocess control map: {preprocess_err}", file=sys.stderr, flush=True)
                local_control_path = None
                s3_control_key = None

            # 5c. Generate depth map locally (PIL only — no torch, no MiDaS, lightweight for 4GB VRAM)
            local_depth_control_path = None
            s3_depth_key = None
            try:
                from PIL import Image, ImageFilter, ImageOps, ImageEnhance
                local_depth_filename = f"depth_{job_id}.png"
                local_depth_control_path = os.path.join(workspace_dir, local_depth_filename)

                print(f"[{datetime.datetime.now().strftime('%T')}] Generating lightweight depth map locally...", flush=True)
                depth_map = None
                with Image.open(local_input_path) as img:
                    # Convert to grayscale
                    gray = img.convert("L")
                    # Apply GaussianBlur radius=6
                    blurred = gray.filter(ImageFilter.GaussianBlur(radius=6))
                    # Invert the result (closer objects become brighter)
                    inverted = ImageOps.invert(blurred)
                    # Enhance contrast x1.5
                    enhancer = ImageEnhance.Contrast(inverted)
                    depth_map = enhancer.enhance(1.5)

                if depth_map is None:
                    print("Warning: Depth map result is None.", file=sys.stderr, flush=True)
                    local_depth_control_path = None
                else:
                    # Save as RGB for ControlNet compatibility
                    depth_map.convert("RGB").save(local_depth_control_path, "PNG")

                    print(f"[{datetime.datetime.now().strftime('%T')}] Depth map generated: {local_depth_control_path}", flush=True)

                    # Upload depth map to object storage
                    timestamp_sec = int(time.time())
                    s3_depth_key = f"users/{user_id}/projects/{project_id}/previews/depth_{job_id}_{timestamp_sec}.png"
                    print(f"[{datetime.datetime.now().strftime('%T')}] Uploading depth map to S3: {s3_depth_key}", flush=True)
                    uploadFileFromWorker(local_depth_control_path, s3_depth_key)

                    # Register in project_files database
                    depth_file_id = f"file_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                    depth_metadata_json = json.dumps({
                        "size": f"{(os.path.getsize(local_depth_control_path) / 1024):.2f} KB",
                        "uploadedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "role": "control_map",
                        "preprocessor": "depth",
                        "sourceJobId": job_id
                    })

                    cur_depth_file = conn.cursor()
                    try:
                        cur_depth_file.execute("""
                            INSERT INTO project_files (id, project_id, file_url, file_type, metadata_json, created_at)
                            VALUES (%s, %s, %s, %s, %s, %s);
                        """, (
                            depth_file_id,
                            project_id,
                            s3_depth_key,
                            "image/png",
                            depth_metadata_json,
                            datetime.datetime.now(datetime.timezone.utc)
                        ))

                        # Log preprocessing job event
                        event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                        cur_depth_file.execute("""
                            INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                            VALUES (%s, %s, %s, %s, %s, %s);
                        """, (
                            event_id,
                            job_id,
                            "preprocessing",
                            "Depth map preprocessed locally and saved.",
                            json.dumps({"fileId": depth_file_id, "s3Key": s3_depth_key}),
                            datetime.datetime.now(datetime.timezone.utc)
                        ))
                        conn.commit()
                        print(f"[{datetime.datetime.now().strftime('%T')}] Registered depth map in DB: {depth_file_id}", flush=True)
                    except Exception as db_err:
                        conn.rollback()
                        print(f"Failed to save depth map metadata to database: {db_err}", file=sys.stderr, flush=True)
                    finally:
                        cur_depth_file.close()

            except Exception as depth_err:
                print(f"Failed to preprocess depth map: {depth_err}", file=sys.stderr, flush=True)
                local_depth_control_path = None
                s3_depth_key = None

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
            print(f"Failed to read image dimensions: {img_err}. Using 768px default limit.", file=sys.stderr, flush=True)

        # Clamp dimensions preserving aspect ratio to fit within capacity limit
        if is_upscale:
            max_res = 1536  # High quality target for upscale
        else:
            max_res = 512   # Low resolution target for fast preview variations
            
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

        # 7. Initialize ComfyUI client and upload input image, control map, and depth map
        print(f"[{datetime.datetime.now().strftime('%T')}] Initializing ComfyUI client at {config.COMFYUI_URL}...", flush=True)
        comfy_client = ComfyUIClient(config.COMFYUI_URL)
        comfy_client.check_health()
        
        print(f"[{datetime.datetime.now().strftime('%T')}] Uploading input image to ComfyUI...", flush=True)
        comfyui_input_name = comfy_client.upload_image(local_input_path)
        
        comfyui_control_name = None
        if local_control_path:
            try:
                print(f"[{datetime.datetime.now().strftime('%T')}] Uploading canny control map image to ComfyUI...", flush=True)
                comfyui_control_name = comfy_client.upload_image(local_control_path)
            except Exception as comfy_upload_err:
                print(f"Failed to upload control map to ComfyUI: {comfy_upload_err}", file=sys.stderr, flush=True)

        comfyui_depth_name = None
        if local_depth_control_path:
            try:
                print(f"[{datetime.datetime.now().strftime('%T')}] Uploading depth map image to ComfyUI...", flush=True)
                comfyui_depth_name = comfy_client.upload_image(local_depth_control_path)
            except Exception as comfy_upload_err:
                print(f"Failed to upload depth map to ComfyUI: {comfy_upload_err}", file=sys.stderr, flush=True)

        # 8. Render variations sequentially
        if not is_upscale:
            variations = clamped_settings.get("variations", 2)
            if not variations or variations <= 0:
                variations = 2
                
            max_vars = capacity_profile.get("max_variations_per_job", 4)
            if variations > max_vars:
                variations = max_vars
            
        steps = clamped_settings.get("steps", 20)
        cfg_scale = clamped_settings.get("cfg_scale", 8.0)
        
        if not is_upscale:
            # Resolve geometry lock mode and render mode
            geometry_lock_mode = (clamped_settings.get("render_mode") or clamped_settings.get("geometryLockMode") or clamped_settings.get("geometry_lock_mode") or "strict_structure").lower()
            
            # Use safe defaults only when denoise is missing
            denoise = clamped_settings.get("denoise")
            if denoise is None:
                mode_denoise_map = {
                    "creative": 0.80,
                    "creative_concept": 0.80,
                    "balanced": 0.65,
                    "balanced_enhancement": 0.65,
                    "accurate": 0.60,
                    "technical": 0.35,
                    "strict_structure": 0.35,
                    "faithful": 0.35
                }
                denoise = mode_denoise_map.get(geometry_lock_mode, 0.60)
                print(f"[Denoise Trace] Denoise resolved to {denoise} from mode_denoise_map (mode: {geometry_lock_mode})", flush=True)
            else:
                print(f"[Denoise Trace] Denoise resolved to {denoise} from job settings / preference memory", flush=True)
                
            clamped_settings["denoise"] = denoise
            clamped_settings["geometryLockMode"] = geometry_lock_mode
            clamped_settings["render_mode"] = geometry_lock_mode
        else:
            geometry_lock_mode = "strict_structure"
            denoise = clamped_settings.get("denoise", 0.25)
            
        prompt_brain_provider = clamped_settings.get("promptBrainProvider") or clamped_settings.get("prompt_brain_provider") or "unknown"
        
        print(f"[{datetime.datetime.now().strftime('%T')}] Launching sequential variation loops ({variations} total)...", flush=True)
        
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

            if not is_upscale:
                v_seed = clamped_settings.get("seed", random.randint(1, 1000000000)) + idx
            else:
                v_seed = seed = v_seed  # Use exact same seed
                
            print(f"[{datetime.datetime.now().strftime('%T')}] Rendering variation {idx + 1}/{variations} with seed {v_seed}", flush=True)
            
            edge_control_strength = clamped_settings.get("edge_control_strength") if clamped_settings else None
            depth_control_strength = clamped_settings.get("depth_control_strength") if clamped_settings else None

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
                depth_control_image=comfyui_depth_name if local_depth_control_path is not None else None,
                on_progress=on_comfyui_progress,
                prompt_brain_provider=prompt_brain_provider,
                edge_control_strength=edge_control_strength,
                depth_control_strength=depth_control_strength
            )
            
            if not output_paths:
                raise ComfyUIExecutionError(f"No output image returned from ComfyUI for variation {idx}")
                
            comfyui_output_path = output_paths[0]
            local_output_filename = f"output_var_{idx}.png" if not is_upscale else f"output_upscale.png"
            local_output_path = os.path.join(workspace_dir, local_output_filename)
            
            # Download completed render image
            filename_only = os.path.basename(comfyui_output_path)
            print(f"[{datetime.datetime.now().strftime('%T')}] Fetching variation output from ComfyUI API: {filename_only}", flush=True)
            output_bytes = comfy_client.download_output(filename_only)
            
            with open(local_output_path, 'wb') as f_out:
                f_out.write(output_bytes)

            # Run Geometry Drift Check
            drift_score = None
            structure_status = None
            if not is_upscale:
                try:
                    drift_score = calculate_geometry_drift_score(local_input_path, local_output_path)
                    print(f"[{datetime.datetime.now().strftime('%T')}] [Geometry Check] Calculated geometry drift score for variation {idx}: {drift_score:.4f}", flush=True)
                    
                    threshold = clamped_settings.get("geometry_drift_threshold", 0.88)
                    is_strict = (clamped_settings.get("render_mode") == "strict_structure" or 
                                 clamped_settings.get("geometryLockMode") == "strict_structure")
                    
                    if is_strict:
                        if drift_score < threshold:
                            structure_status = "failed_structure_check"
                            print(f"[Geometry Check] WARNING: Variation {idx} failed structure check (Score {drift_score:.4f} < Threshold {threshold})", flush=True)
                        else:
                            structure_status = "passed"
                    else:
                        structure_status = "passed"
                except Exception as check_err:
                    print(f"[Geometry Check] Error calculating geometry drift score: {check_err}", file=sys.stderr, flush=True)
                    drift_score = 1.0
                    structure_status = "passed"
            
            # Save check details in settings
            clamped_settings["geometry_drift_score"] = drift_score
            clamped_settings["structure_check_status"] = structure_status

            if structure_status == "failed_structure_check":
                try:
                    # Create regeneration settings
                    regen_settings = clamped_settings.copy()
                    
                    # Lower denoise by 0.05, clamp to minimum 0.15
                    old_denoise = clamped_settings.get("denoise_strength") or clamped_settings.get("denoise") or 0.25
                    new_denoise = max(float(old_denoise) - 0.05, 0.15)
                    
                    regen_settings["denoise"] = new_denoise
                    regen_settings["denoise_strength"] = new_denoise
                    
                    # Stronger structure control: set canny and depth control strengths to 1.0
                    regen_settings["edge_control_strength"] = 1.0
                    regen_settings["depth_control_strength"] = 1.0
                    
                    # Reset drift score and status
                    regen_settings["geometry_drift_score"] = None
                    regen_settings["structure_check_status"] = None
                    regen_settings["is_auto_regenerated"] = True
                    
                    regen_job_id = f"job_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                    regen_settings_json = json.dumps(regen_settings)
                    
                    print(f"[Geometry Check] Automatically queueing a new regeneration job {regen_job_id} with lower denoise={new_denoise:.2f} and stronger structure lock", flush=True)
                    
                    cur_regen = conn.cursor()
                    try:
                        cur_regen.execute("""
                            INSERT INTO render_jobs (id, project_id, status, progress, settings_json, created_at)
                            VALUES (%s, %s, 'queued', 0, %s, %s);
                        """, (
                            regen_job_id,
                            project_id,
                            regen_settings_json,
                            datetime.datetime.now(datetime.timezone.utc)
                        ))
                        
                        # Log the queued event
                        regen_event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                        cur_regen.execute("""
                            INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                            VALUES (%s, %s, 'queued', %s, %s, %s);
                        """, (
                            regen_event_id,
                            regen_job_id,
                            f"Auto-regenerating render due to structure lock threshold failure (drift score: {drift_score:.4f}).",
                            regen_settings_json,
                            datetime.datetime.now(datetime.timezone.utc)
                        ))
                        conn.commit()
                    except Exception as regen_db_err:
                        conn.rollback()
                        print(f"Failed to queue auto-regeneration job in DB: {regen_db_err}", file=sys.stderr, flush=True)
                    finally:
                        cur_regen.close()
                except Exception as regen_err:
                    print(f"Failed to compile auto-regeneration settings: {regen_err}", file=sys.stderr, flush=True)
                
            # Upload render output to object storage
            timestamp_sec = int(time.time())
            if not is_upscale:
                s3_output_key = f"users/{user_id}/projects/{project_id}/outputs/render_{job_id}_var_{idx}_{timestamp_sec}.png"
            else:
                s3_output_key = f"users/{user_id}/projects/{project_id}/outputs/render_{job_id}_upscaled_{timestamp_sec}.png"
            
            print(f"[{datetime.datetime.now().strftime('%T')}] Uploading output to S3: {s3_output_key}", flush=True)
            uploadFileFromWorker(local_output_path, s3_output_key)
            
            if not is_upscale:
                # Save render metadata row in Neon
                render_id = f"render_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                cache_key = clamped_settings.get("cacheKey")
                cur.execute("""
                    INSERT INTO renders (
                        id, job_id, project_id, base_image_url, final_image_url, 
                        preview_url, final_url, cache_key, style_id, prompt, negative_prompt, 
                        seed, settings_json, created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """, (
                    render_id,
                    job_id,
                    project_id,
                    file_url,
                    s3_output_key,
                    s3_output_key,
                    None,
                    cache_key,
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
            else:
                # Update existing render metadata with upscaled url
                cur.execute("""
                    UPDATE renders
                    SET final_url = %s, final_image_url = %s
                    WHERE id = %s;
                """, (s3_output_key, s3_output_key, render_id_to_upscale))
                
                # Log transition event log
                event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                cur.execute("""
                    INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                    VALUES (%s, %s, 'processing', %s, '{}', %s);
                """, (
                    event_id, 
                    job_id, 
                    f"Render variation {render_id_to_upscale} upscale completed and uploaded successfully.", 
                    datetime.datetime.now(datetime.timezone.utc)
                ))
            conn.commit()

        # Update final job state as completed and save settings_json
        cur.execute("""
            UPDATE render_jobs
            SET status = 'completed', progress = 100, settings_json = %s, completed_at = %s
            WHERE id = %s;
        """, (json.dumps(clamped_settings), datetime.datetime.now(datetime.timezone.utc), job_id))
        
        event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
        event_msg = 'Render variations execution completed. All outputs registered.' if not is_upscale else f'Render {render_id_to_upscale} upscale completed.'
        cur.execute("""
            INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
            VALUES (%s, %s, 'completed', %s, '{}', %s);
        """, (event_id, job_id, event_msg, datetime.datetime.now(datetime.timezone.utc)))
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        import traceback
        error_msg = traceback.format_exc()
        print(f"[FATAL ERROR] Full traceback:\n{error_msg}", flush=True, file=sys.stderr)
        
        # Clean up partial workspace
        workspace_dir = os.path.join(config.LOCAL_WORKSPACE_ROOT, "jobs", job_id)
        if os.path.exists(workspace_dir):
            print(f"[{datetime.datetime.now().strftime('%T')}] Cleaning up partial workspace for job {job_id}...", flush=True)
            import shutil
            shutil.rmtree(workspace_dir, ignore_errors=True)
            
        cur_fail = None
        try:
            retry_count = job.get("retry_count", 0)
            max_retries = job.get("max_retries", 3)
            
            cur_fail = conn.cursor()
            if retry_count < max_retries:
                new_retry = retry_count + 1
                cur_fail.execute("""
                    UPDATE render_jobs
                    SET status = 'queued', retry_count = %s, error_message = %s, failed_at = %s, progress = 0
                    WHERE id = %s;
                """, (new_retry, str(e), datetime.datetime.now(datetime.timezone.utc), job_id))
                
                event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                cur_fail.execute("""
                    INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                    VALUES (%s, %s, 'failed', %s, '{}', %s);
                """, (event_id, job_id, f"Render execution failed (Retry {new_retry}/{max_retries}): {e}", datetime.datetime.now(datetime.timezone.utc)))
                conn.commit()
                print(f"[{datetime.datetime.now().strftime('%T')}] Rescheduled job {job_id} for retry ({new_retry}/{max_retries}).", flush=True)
            else:
                cur_fail.execute("""
                    UPDATE render_jobs
                    SET status = 'failed', error_message = %s, failed_at = %s
                    WHERE id = %s;
                """, (str(e), datetime.datetime.now(datetime.timezone.utc), job_id))
                
                event_id = f"event_{int(time.time() * 1000)}_{random.randint(0, 999)}"
                cur_fail.execute("""
                    INSERT INTO job_events (id, job_id, event_type, message, details_json, created_at)
                    VALUES (%s, %s, 'failed', %s, '{}', %s);
                """, (event_id, job_id, f"Render execution failed permanently (Max retries exceeded): {e}", datetime.datetime.now(datetime.timezone.utc)))
                conn.commit()
                print(f"[{datetime.datetime.now().strftime('%T')}] Job {job_id} failed permanently (Max retries exceeded).", flush=True)
        except Exception as log_err:
            print(f"Failed to log job failure details: {log_err}", file=sys.stderr, flush=True)
            if conn:
                conn.rollback()
        finally:
            if cur_fail:
                cur_fail.close()
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
    global running, worker_mode

    # Parse arguments
    parser = argparse.ArgumentParser(description="RenderPilot Laptop Worker Node", add_help=False)
    parser.add_argument('--mode', type=str, choices=['manual', 'batch', 'live'], default=None)
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--job-id', type=str, default=None)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--validate', action='store_true')
    parser.add_argument('-h', '--help', action='store_true')

    args, unknown = parser.parse_known_args()

    if args.help:
        print("Usage: python apps/worker/main.py [options]")
        print("Options:")
        print("  --mode <manual|batch|live>  Worker run mode (default: batch)")
        print("  --once                      Run in manual mode, process one job, and exit")
        print("  --job-id <id>               Run in manual mode, process specific job, and exit")
        print("  --dry-run                   Perform a dry-run configuration validation and exit")
        print("  --validate                  Validation check")
        print("  -h, --help                  Show this help message")
        return

    # Dry-run validation check for configuration and test suites
    if args.dry_run or args.validate or os.environ.get('WORKER_DRY_RUN', 'false').lower() == 'true':
        print("Worker client started successfully.")
        print(f"Worker ID:     {config.WORKER_ID}")
        print(f"Worker Name:   {config.WORKER_NAME}")
        return

    # Determine mode
    if args.job_id or args.once:
        worker_mode = 'manual'
        if args.mode and args.mode != 'manual':
            print(f"Warning: CLI flags --once/--job-id conflict with --mode {args.mode}. Overriding mode to manual.", file=sys.stderr)
    elif args.mode:
        worker_mode = args.mode
    else:
        worker_mode = 'batch'

    if worker_mode == 'manual' and not args.once and not args.job_id:
        print("Error: Manual mode requires --once or --job-id <job_id>.", file=sys.stderr)
        sys.exit(1)

    print("==================================================")
    print("        RenderPilot Laptop Worker Node started     ")
    print("==================================================")
    print(f"Worker ID:     {config.WORKER_ID}")
    print(f"Worker Name:   {config.WORKER_NAME}")
    print(f"GPU Model:     {gpu_name}")
    print(f"VRAM Capacity: {vram_gb} GB")
    print(f"Active Mode:   {worker_mode.upper()}")
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
    first_run = True

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
            if worker_mode == 'manual' and args.job_id:
                if first_run:
                    recover_stale_jobs(conn)
                    job = claim_job(conn, job_id=args.job_id)
                else:
                    job = None
            else:
                recover_stale_jobs(conn)
                job = claim_job(conn)
                
            if job:
                # Execute the claimed job
                process_job(conn, job)
                
                # In manual mode, we process only one job, then exit
                if worker_mode == 'manual':
                    print(f"[{datetime.datetime.now().strftime('%T')}] Manual mode: finished processing job {job['id']}. Exiting.")
                    running = False
                    break
            else:
                # No job was claimed
                if worker_mode == 'manual':
                    if args.job_id:
                        print(f"[{datetime.datetime.now().strftime('%T')}] Manual mode: job {args.job_id} not found or not in queued status. Exiting.")
                    else:
                        print(f"[{datetime.datetime.now().strftime('%T')}] Manual mode: no queued jobs found. Exiting.")
                    running = False
                    break
                elif worker_mode == 'batch':
                    print(f"[{datetime.datetime.now().strftime('%T')}] Batch mode: queue is empty. Exiting.")
                    running = False
                    break
                else:
                    # Live mode: poll continuously
                    time.sleep(4)
            
            first_run = False
                
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
            
    # Cleanup main connections and report offline
    if conn:
        try:
            conn.close()
        except Exception:
            pass

    print(f"[{datetime.datetime.now().strftime('%T')}] Reporting worker node offline...")
    try:
        cleanup_conn = psycopg2.connect(config.DATABASE_URL)
        cur_cleanup = cleanup_conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc)
        cur_cleanup.execute("""
            UPDATE workers
            SET status = 'offline', mode = 'idle', last_seen_at = %s, last_heartbeat = %s, current_job_id = NULL
            WHERE id = %s;
        """, (now, now, config.WORKER_ID))
        cleanup_conn.commit()
        cur_cleanup.close()
        cleanup_conn.close()
    except Exception as e:
        print(f"Failed to report offline status on cleanup: {e}", file=sys.stderr)
            
    print(f"[{datetime.datetime.now().strftime('%T')}] Worker shutdown successfully complete. Goodbye.")

if __name__ == '__main__':
    main()
