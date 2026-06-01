# RenderPilot Laptop Workstation Worker

This Python application acts as a private worker node running locally on your workstation laptop. It connects directly to your Neon PostgreSQL database to poll for queued render jobs, claims them safely using transactions, simulates the rendering pipeline, and records execution events and outputs.

## Prerequisites

- **Python 3.8+** installed and added to your Windows PATH.
- **Git** installed on Windows.

## Local Configuration

The worker loads environment configuration from the `.env` file in the parent project folder or a local `.env` file inside the `apps/worker` folder. Ensure the following environment variables are configured:

```env
DATABASE_URL=postgresql://neondb_owner:***@ep-***.us-east-1.aws.neon.tech/neondb?sslmode=require
WORKER_ID=laptop_node_01
WORKER_NAME=Laptop Workstation 01
COMFYUI_URL=http://127.0.0.1:8188
BLENDER_PATH=C:\Program Files\Blender Foundation\Blender 4.2\blender.exe
LOCAL_WORKSPACE_ROOT=C:\Users\Vaidehi\Desktop\renderpiloy\storage
STORAGE_PROVIDER=local
STORAGE_BUCKET=renderpilot-bucket
AWS_REGION=us-east-1
AWS_S3_BUCKET=renderpilot-s3-bucket
AWS_ACCESS_KEY_ID=mock-key
AWS_SECRET_ACCESS_KEY=mock-secret
```

*Note: Secrets like `DATABASE_URL` are parsed securely and are never printed in console output logs.*

## Quick Start on Windows

Execute the following commands in your terminal (PowerShell or Command Prompt) inside the `apps/worker` directory:

1. **Navigate to the worker workspace folder**:
   ```powershell
   cd apps/worker
   ```

2. **Create a clean Python virtual environment**:
   ```powershell
   python -m venv venv
   ```

3. **Activate the virtual environment**:
   - In **PowerShell**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   - In **Command Prompt**:
     ```cmd
     .\venv\Scripts\activate.bat
     ```

4. **Install required dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```

5. **Start the worker script**:
   ```powershell
   python main.py
   ```

## Key Worker Features

- **Graceful Shutdown**: Pressing `Ctrl+C` triggers an immediate database update setting the node status to `offline` before exiting, preventing 60-second timeouts.
- **Background Heartbeat**: Runs a daemon thread reporting heartbeats every 10 seconds to indicate online status or rendering mode status.
- **GPU Telemetry**: Programmatically queries Windows Video Controller properties to extract your active GPU model name and dedicated VRAM capacity.
- **Atomic Locking**: Uses raw transaction-safe SQL querying (`FOR UPDATE SKIP LOCKED`) to claim queued render job rows without conflicts.
