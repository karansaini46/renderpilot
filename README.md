# RenderPilot

RenderPilot is a local-first architectural visualization and rendering orchestration platform. It connects local design applications like Blender with local image generation pipelines (e.g., ComfyUI) to enable designers to visualize CAD structures and rendering ideas entirely offline.

## System Architecture

RenderPilot runs as a local monorepo consisting of:
- **`apps/web`**: Next.js frontend console for dashboard management, project assets, and visualization workflows.
- **`apps/api`**: FastAPI backend exposing REST endpoints and managing project metadata using a local SQLite database.
- **`workers/blender_worker`**: A Python service that automates background, headless rendering pipelines using Blender's Python API.
- **`workers/comfy_worker`**: A Python service that orchestrates local image-to-image and ControlNet generation pipelines through the ComfyUI API.

---

## Hardware Optimization Guidelines (RTX 3050 / 4GB VRAM Constraints)

To run successfully on a Windows laptop with a 4GB VRAM GPU (RTX 3050-class), RenderPilot enforces strict hardware utilization boundaries:

1. **Batch Size Limit**: Locked to `1` image generation per request to prevent Out-Of-Memory (OOM) errors.
2. **Model Standard**: Uses Stable Diffusion 1.5 (SD 1.5) checkpoints, which consume ~2.0 GB VRAM, leaving sufficient overhead for UI processes and operating system operations.
3. **ControlNet Boundary**: Limited to a maximum of `1` active ControlNet layer (e.g., Depth or Canny) per render run.
4. **No Automated Training**: Automated model fine-tuning (such as LoRA training) is excluded from the MVP. Training operations require massive VRAM overhead and will trigger OOMs on 4GB hardware.
5. **Local-Only Storage**: All project files, CAD models, pipeline schemas, and final renders are stored locally in the `/storage` directory. No external cloud endpoints are utilized.

---

## Local Setup Instructions (Windows)

### Prerequisites
- **Python 3.10 or 3.11** (Ensure Python is added to your Windows PATH)
- **Node.js LTS (v18 or v20)** and npm
- **Blender** (v4.0+ recommended)
- **ComfyUI** (running locally on port `8188`)

### Step 1: Clone and Configure Environment

1. Copy the environment configuration template:
   ```cmd
   copy .env.example .env
   ```
2. Open `.env` and update the paths to match your local setup:
   - `BLENDER_EXE_PATH`: Point to your local `blender.exe`.
   - `COMFYUI_URL`: Point to your running ComfyUI instance (default: `http://127.0.0.1:8188`).
   - `PROJECT_STORAGE_PATH`: Path to this repository's `storage` folder.
   - `SQLITE_DB_PATH`: Path to the SQLite database file (e.g., inside the `storage` folder).

### Step 2: Install Node.js Dependencies

From the root directory, run:
```cmd
npm install
```

### Step 3: Set Up the FastAPI Backend

1. Navigate to the API application:
   ```cmd
   cd apps/api
   ```
2. Create and activate a Python virtual environment:
   ```cmd
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. Install Python dependencies:
   ```cmd
   pip install -r requirements.txt
   ```

### Step 4: Set Up the Workers

Follow similar steps for `workers/blender_worker` and `workers/comfy_worker`:
1. Navigate to the worker directory.
2. Create and activate a virtual environment.
3. Install dependencies:
   ```cmd
   pip install -r requirements.txt
   ```

---

## Development Operations

### Running the Services

To run the web app and API concurrently in development mode, run the startup script:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

Or start the servers individually:
- **Frontend (`apps/web`)**: `npm run dev:web` (Runs on `http://localhost:3000`)
- **Backend (`apps/api`)**: Activate venv and run `uvicorn main:app --reload` (Runs on `http://localhost:8000`)
- **Blender Worker**: Activate venv and run `python worker.py`
- **ComfyUI Worker**: Activate venv and run `python worker.py`
