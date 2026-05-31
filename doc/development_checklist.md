# RenderPilot Development Checklist

Use this checklist to track development stages, local environment validation, and testing milestones for the RenderPilot platform.

---

## 1. Environment & Setup Checklist
- [ ] Install **Node.js LTS (v18+)** and verify `node --version` runs.
- [ ] Install **Python (v3.10+)** and verify `python --version` runs.
- [ ] Install **Blender (v4.0+)** and note the absolute path to `blender.exe`.
- [ ] Set up local copy of **ComfyUI** and download the base checkpoint:
  - Download `v1-5-pruned-emaonly.safetensors` and place it in the ComfyUI models folder.
- [ ] Create the local configuration:
  - Copy `.env.example` to `.env` and fill out absolute paths.

---

## 2. API & SQLite Integration Checklist
- [ ] Run initial FastAPI startup:
  - Activate venv in `apps/api/` and run `uvicorn main:app --reload`.
  - Open `http://localhost:8000/docs` to inspect Swagger endpoints.
- [ ] Verify Database Schema creation:
  - Check that SQLite database file is created at the path specified by `SQLITE_DB_PATH`.
  - Confirm table models (`projects`, `render_jobs`) are instantiated.
- [ ] Test REST API CRUD operations:
  - Send POST request to `/projects` to register a test Blender file.
  - Send GET request to `/projects` to retrieve the registered project list.
  - Send POST request to `/render` to request a render task.
- [ ] Validate Hardware Limiter Rules:
  - Send a POST request to `/render` with `batch_size = 2` and confirm it fails validation.
  - Send a POST request to `/render` with `controlnet_layers = 2` and confirm it fails validation.

---

## 3. Worker Execution Checklist
- [ ] Run Blender Worker:
  - Activate venv in `workers/blender_worker/` and run `python worker.py`.
  - Create a mock `.blend` file in `storage/projects/` corresponding to the registered project.
  - Submit a new render task and verify that the Blender worker detects the job, sets it to `BLENDER_EXPORT`, runs successfully, and outputs the depth geometry pass.
- [ ] Run ComfyUI Worker:
  - Activate venv in `workers/comfy_worker/` and run `python worker.py`.
  - Verify that the ComfyUI worker polls the job queue, picks up the job with status `GENERATING`, constructs the API payload, and generates the final output frame in `storage/outputs/`.

---

## 4. Frontend Visual Console Checklist
- [ ] Install Next.js dependencies:
  - Run `npm install` in the monorepo root.
- [ ] Run Next.js in development:
  - Run `npm run dev:web` and open `http://localhost:3000`.
- [ ] Visual Inspection:
  - Confirm dark mode, gradients, and typography render correctly.
  - Inspect grid alignment for both mobile and desktop sizing.
  - Verify connection state lights match the local state (API online, ComfyUI simulator button working).
- [ ] Interactive Process Testing:
  - Click "Trigger Rendering Engine" and watch the console stream outputs.
  - Verify that when the simulation completes (100%), the file naming changes to `.png` and displays outputs directory path.
