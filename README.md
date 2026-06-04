# RenderPilot

RenderPilot is a laptop-first architectural visualization platform. It connects cloud-managed rendering consoles to offline private Windows laptop rendering engines, allowing design professionals to queue, manage, and deliver photorealistic renders without exposing local hardware to the internet.

---

## Architecture

RenderPilot runs on a decoupled cloud-and-local workspace design:

- **Vercel Web Console (`apps/web`)**: Next.js frontend hosted on Vercel, providing project dashboards, render controls, quality review, and client delivery workflows.
- **Cloud Database (Neon PostgreSQL)**: Persistent PostgreSQL server storing projects, render job queues, worker statuses, material mappings, style presets, client feedback, and operational telemetry.
- **Object Storage (S3/R2)**: S3-compatible cloud storage hosting base design assets and finished render outputs, keeping database transaction footprints small.
- **Laptop Worker (`apps/worker`)**: Local Python daemon running on a private workstation. It polls the cloud database queue, claims jobs atomically, and invokes local rendering pipelines (Blender, ComfyUI).
- **Network Model**: The laptop worker operates as a pull-only client. No port-forwarding or inbound connections are required.

---

## Features

### Rendering Pipeline
- Queue-based render job management with priority scheduling
- Preview-first workflow with targeted high-resolution upscale passes
- Deterministic render caching with MD5-based cache keys
- Configurable geometry lock modes (creative, balanced, accurate, technical)
- Automated depth, canny, and normal control pass generation
- Material detection, mapping, and memory for consistent finishes

### Quality & Dataset Management
- Per-render quality scoring and approval workflows
- Training dataset curation dashboard for fine-tuning data preparation
- Training package export with images, captions, metadata, and config
- LoRA model version registry with benchmark scoring and activation controls

### Client Delivery
- Password-protected shareable delivery portals
- Client commenting on individual render variations
- Direct download of approved high-resolution images

### Operations
- Admin dashboard with real-time operational metrics
- Worker node GPU/VRAM telemetry and heartbeat monitoring
- Job queue analytics (processing time, cache hits, upscale counts)
- Client revision memory for incorporating past feedback into future renders

### Worker Safety
- Sequential job processing with configurable VRAM-safe batch limits
- Graceful shutdown with immediate offline status reporting
- Stale job recovery with automatic retry and max-retry failover
- Local resource locking to prevent concurrent GPU overload

---

## Directory Structure

```
renderpilot/
├── apps/
│   ├── web/                     # Vercel Next.js Web Console
│   └── worker/                  # Python Laptop Worker Daemon
├── packages/
│   └── shared/                  # Shared Prisma schema and constants
├── migrations/                  # Raw SQL migration scripts
├── docs/                        # Deployment and architecture guides
├── scripts/                     # Developer utility scripts
├── storage/                     # Local file storage (gitignored)
│   ├── projects/                # Local project assets
│   ├── models/                  # Model checkpoints
│   ├── workflows/               # ComfyUI workflow definitions
│   └── outputs/                 # Generated render outputs
├── .env.example                 # Environment configuration template
├── .gitignore                   # Repository ignore rules
├── vercel.json                  # Vercel deployment configuration
└── README.md                    # This file
```

---

## Getting Started

### Prerequisites

- **Node.js 18+** and **pnpm** for the web console
- **Python 3.8+** for the laptop worker
- **Neon PostgreSQL** account (free tier)
- **S3-compatible storage** bucket (AWS S3, Cloudflare R2, or local fallback)

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/karansaini46/renderpilot.git
   cd renderpilot
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your Neon database URL, storage credentials, and worker paths
   ```

3. **Install dependencies**:
   ```bash
   pnpm install
   ```

4. **Push database schema**:
   ```bash
   cd packages/shared
   npx prisma db push
   cd ../..
   ```

5. **Run the web console locally**:
   ```bash
   pnpm --filter web dev
   ```

6. **Start the laptop worker** (in a separate terminal):
   ```bash
   cd apps/worker
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt
   python main.py
   ```

See [apps/worker/README.md](apps/worker/README.md) for detailed worker CLI options and [docs/vercel_deployment.md](docs/vercel_deployment.md) for production deployment instructions.

---

## Hardware Requirements

RenderPilot is designed to run safely on consumer-grade Windows laptops:

| Specification       | Minimum           | Recommended        |
|---------------------|-------------------|--------------------|
| GPU VRAM            | 4 GB              | 8 GB+              |
| System RAM          | 8 GB              | 16 GB+             |
| GPU                 | NVIDIA GTX 1650   | NVIDIA RTX 3060+   |
| Storage             | 20 GB free        | 50 GB+ free        |
| OS                  | Windows 10/11     | Windows 11         |

Default safety settings enforce batch size 1, single ControlNet layers, and SD 1.5 checkpoint compatibility to prevent VRAM overflow on entry-level hardware.

---

## Branch Conventions

| Branch Pattern                     | Purpose                          |
|------------------------------------|----------------------------------|
| `main`                             | Stable production release        |
| `feature/<feature-name>`          | New feature development          |
| `fix/<issue-description>`         | Bug fixes                        |
| `chore/<task-description>`        | Maintenance and cleanup          |

---

## License

Private repository. All rights reserved.
