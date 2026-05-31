# RenderPilot Monorepo

RenderPilot is a laptop-first architectural visualization and rendering orchestration platform. It is engineered to bridge cloud-managed rendering gateway registers with offline, high-performance local rendering workstations.

---

## Architectural Topology

RenderPilot operates on a decoupled cloud-gateway and local-worker topology:

```
+-------------------------------------------------+
|               Cloud Gateway (API)               |
|  - Manages User accounts and approvals          |
|  - Persists jobs and rules in Neon PostgreSQL  |
|  - Exposes endpoints to query worker node state |
+-------------------------------------------------+
                        ^
                        | (REST Polling via HTTPS)
                        v
+-------------------------------------------------+
|       Private Windows Workstation Worker        |
|  - Polls gateway for active rendering jobs      |
|  - Invokes headless Blender geometry passes     |
|  - Triggers local ComfyUI Stable Diffusion runs |
|  - Enforces VRAM safeguards (batch size 1)      |
+-------------------------------------------------+
```

- **Cloud Gateway Registry**: The online application uses **Neon PostgreSQL** as the primary datastore to manage users, queued render tasks, approval feedback, stylistic rules, and worker heartbeat checks.
- **Local Laptop Worker**: Heavy computational workload is handled by a private Windows laptop worker running Blender, ComfyUI, and Stable Diffusion. 
- **Security & Networking**: The laptop worker functions entirely as a client pulling assignments from the cloud gateway. **Users never connect directly to the laptop worker**, removing firewall configuration and port-forwarding requirements.

---

## Monorepo Module Layout

```
renderpilot/
├── apps/
│   ├── web/                     # Next.js & Tailwind CSS Frontend Console
│   ├── api/                     # FastAPI Gateway API (communicates with Neon PostgreSQL)
│   └── worker/                  # Unified Python Worker polling and running render passes
├── packages/
│   └── shared/                  # Shared helper libraries and database validation schemes
├── blender/
│   ├── scripts/                 # Headless Blender python automation utilities
│   └── presets/                 # Blender camera and lighting templates
├── comfyui/
│   └── workflows/               # JSON workflow templates for local stable diffusion pipelines
├── infra/                       # Docker deployment configs and environment manifests
├── storage/                     # Git-ignored local file cache for checkpoints and output files
├── docs/                        # Setup guides and reference documents
├── scripts/                     # Developer utility and environment test scripts
└── package.json                 # Monorepo workspaces definition
```

---

## Laptop Hardware Profile Constraints (RTX 3050 / 4GB VRAM)

The workstation worker is optimized for hardware profiles under 4GB VRAM. It enforces:
1. **Single Frame Limit**: Batch size parameters are strictly locked to `1` in both FastAPI validation schemas and the ComfyUI API runner.
2. **Stable Diffusion 1.5 Baseline**: Fits easily within 2GB of VRAM, leaving memory buffers for OS display functions.
3. **ControlNet Limitation**: Restricts active rendering passes to a maximum of `1` active ControlNet map (e.g. depth model extraction).
4. **No Automated Fine-Tuning**: Excludes automatic training jobs (such as LoRA training scripts) which exceed VRAM limits on laptop hardware.

---

## Installation & Startup

Refer to the detailed guide in the documentation folder:
- **Workstation Configuration**: [docs/setup-windows.md](file:///C:/Users/Vaidehi/Desktop/renderpiloy/docs/setup-windows.md)

### Verification

Ensure your local laptop environment meets all dependencies by executing:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check_environment.ps1
```

### Dev Startup

Run the development process orchestrator:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```
- **Web App UI**: `http://localhost:3000`
- **FastAPI Documentation**: `http://localhost:8000/docs`
