import os
import sys
import time
import psycopg2
import json
import random
from pathlib import Path

# Add apps/worker to path so we can import config and storage
sys.path.append(str(Path(__file__).parent.parent / 'apps' / 'worker'))

from config import config
from storage import uploadFileFromWorker

def run_integration_test():
    print("=" * 70)
    # Highlight the test run
    print("       RenderPilot SketchUp (.skp) Integration & E2E Render Test")
    print("=" * 70)

    print(f"Connecting to database at: {config.DATABASE_URL.split('@')[-1]}")
    conn = psycopg2.connect(config.DATABASE_URL)
    cur = conn.cursor()

    try:
        # 1. Fetch or create a valid user (Fixing foreign key user constraint)
        print("\nChecking for an existing user in the database...")
        cur.execute("SELECT id, email FROM users LIMIT 1;")
        user_row = cur.fetchone()
        
        if user_row:
            user_id = user_row[0]
            user_email = user_row[1]
            print(f"  -> Found existing user: {user_id} ({user_email})")
        else:
            user_id = "test_user_01"
            user_email = "test_user_01@renderpilot.com"
            print(f"  -> No users found. Inserting test user: {user_id}")
            cur.execute(
                "INSERT INTO users (id, email, name, created_at, updated_at) VALUES (%s, %s, %s, NOW(), NOW());",
                (user_id, user_email, "Test User 01")
            )
            conn.commit()

        # 2. Clean up past test assets
        print("\nCleaning up previous test data...")
        project_id = "skp_test_project"
        job_id = "job_skp_test_e2e"

        # Delete any previous render records
        cur.execute("DELETE FROM renders WHERE project_id = %s;", (project_id,))
        cur.execute("DELETE FROM job_events WHERE job_id = %s;", (job_id,))
        cur.execute("DELETE FROM render_jobs WHERE id = %s;", (job_id,))
        cur.execute("DELETE FROM project_files WHERE project_id = %s;", (project_id,))
        cur.execute("DELETE FROM projects WHERE id = %s;", (project_id,))
        conn.commit()
        print("  -> Cleanup complete.")

        # 3. Create a test project
        print(f"\nCreating test project '{project_id}' for user '{user_id}'...")
        cur.execute(
            """
            INSERT INTO projects (id, name, user_id, status, project_type, scene_type, style_preference, created_at, updated_at)
            VALUES (%s, %s, %s, 'active', 'Residential', 'Exterior', 'style_mod_lux_ext', NOW(), NOW());
            """,
            (project_id, "E2E SketchUp Project", user_id)
        )
        conn.commit()
        print("  -> Project created successfully.")

        # 4. Generate and upload a mock .skp model file
        local_skp_path = Path(__file__).parent / "temp_test_model.skp"
        print(f"\nCreating local mock SketchUp model file: {local_skp_path}")
        with open(local_skp_path, "wb") as f:
            f.write(b"SketchUp Model mock binary content\nLine 2\nLine 3\n")
            
        s3_key = f"users/{user_id}/projects/{project_id}/inputs/temp_test_model.skp"
        print(f"Uploading mock SKP model to S3 bucket '{config.AWS_S3_BUCKET}' key '{s3_key}'...")
        uploadFileFromWorker(str(local_skp_path), s3_key)

        # Register in project_files
        file_id = f"file_skp_{int(time.time())}"
        print(f"Registering model file '{file_id}' in project_files table...")
        metadata = json.dumps({
            "size": "42 B",
            "uploadedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "role": "original"
        })
        cur.execute(
            """
            INSERT INTO project_files (id, project_id, file_url, file_type, metadata_json, created_at)
            VALUES (%s, %s, %s, 'model/skp', %s, NOW());
            """,
            (file_id, project_id, s3_key, metadata)
        )
        conn.commit()
        print("  -> Model registered successfully.")

        # Clean up local temp file
        if local_skp_path.exists():
            local_skp_path.unlink()

        # 5. Insert a queued render job
        print(f"\nQueueing render job '{job_id}'...")
        settings_data = {
            "job_type": "base_render_model",
            "stylePreference": "style_mod_lux_ext",
            "prompt": "Architectural rendering of a modern luxury residential villa exterior with wood pillars, concrete slabs, dynamic lighting, and photorealistic foliage",
            "negativePrompt": "low quality, blurry, cartoons, distorted",
            "variations": 1,
            "geometryLockMode": "balanced_archviz",
            "promptBrainProvider": "gemini"
        }
        
        cur.execute(
            """
            INSERT INTO render_jobs (id, project_id, status, progress, settings_json, created_at)
            VALUES (%s, %s, 'queued', 0, %s, NOW());
            """,
            (job_id, project_id, json.dumps(settings_data))
        )
        conn.commit()
        print("  -> Job queued successfully. Now waiting for worker to pick it up...")

        # 6. Poll job execution and print progress events
        last_logged_events = set()
        status = "queued"
        timeout = 180  # 3 minutes timeout
        start_time = time.time()
        
        print("\nPolling job status (Timeout: 180s)...")
        while status in ["queued", "claimed", "processing"] and (time.time() - start_time) < timeout:
            time.sleep(3)
            
            # Fetch current status
            cur.execute("SELECT status, progress, error_message FROM render_jobs WHERE id = %s;", (job_id,))
            job_row = cur.fetchone()
            if not job_row:
                print(f"Error: Job '{job_id}' not found in database anymore!")
                break
                
            status, progress, error_message = job_row
            
            # Fetch recent job events
            cur.execute(
                "SELECT id, event_type, message, created_at FROM job_events WHERE job_id = %s ORDER BY created_at ASC;",
                (job_id,)
            )
            events = cur.fetchall()
            for ev_id, ev_type, ev_msg, ev_time in events:
                if ev_id not in last_logged_events:
                    print(f"  [{ev_time.strftime('%H:%M:%S')}] [{ev_type.upper()}] {ev_msg}")
                    last_logged_events.add(ev_id)
            
            print(f"  -> Job Status: {status.upper()} | Progress: {progress}%", end="\r")

        print("\n" + "-" * 70)
        if status == "completed":
            print(" SUCCESS: Render job completed successfully!")
            
            # Fetch final render details
            cur.execute("SELECT id, base_image_url, final_image_url, prompt FROM renders WHERE job_id = %s LIMIT 1;", (job_id,))
            render_row = cur.fetchone()
            if render_row:
                r_id, r_base, r_final, r_prompt = render_row
                print(f"  Render Record ID: {r_id}")
                print(f"  Base image URL (Blender Pass): {r_base}")
                print(f"  Final render image S3 key:   {r_final}")
                print(f"  Render prompt used:           {r_prompt}")
            else:
                print("  Warning: Job is completed, but no render record was found in the 'renders' table!")
        else:
            print(f" FAILURE: Render job did not complete cleanly.")
            print(f"  Final status:  {status.upper()}")
            cur.execute("SELECT error_message FROM render_jobs WHERE id = %s;", (job_id,))
            err_row = cur.fetchone()
            if err_row and err_row[0]:
                print(f"  Error Message: {err_row[0]}")
            
    except Exception as e:
        print(f"\nAn exception occurred during testing: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    run_integration_test()
