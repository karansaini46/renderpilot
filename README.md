# RenderPilot

RenderPilot is a laptop-first architectural visualization platform. It connects cloud-managed rendering console portals to offline private Windows laptop rendering engines.

---

## Architecture Topology

RenderPilot runs on a decoupled cloud-and-local workspace design:

- **Vercel Web Console (`apps/web`)**: Next.js single-page frontend hosted on Vercel, providing design dashboard controls and asset management.
- **Cloud Database Brain (Neon PostgreSQL)**: Online persistent PostgreSQL server storing user data, rendering requests queue, material classifications, and worker statuses.
- **Object Storage Bucket**: S3-compatible cloud storage buckets hosting base design assets and finished rendering outputs, keeping database transaction footprints small.
- **Laptop Worker Daemon (`apps/worker`)**: Local Python background task running on the user's laptop. It polls the cloud database queue via HTTPS and invokes local rendering pipelines.
- **Network Boundaries**: The local laptop worker behaves exclusively as a client pulling queued jobs. **Users never connect directly to the laptop worker**, removing external port-forwarding requirements.

---

## Directory Structure

```
renderpilot/
├── apps/
│   ├── web/                     # Vercel Next.js Web Console
│   └── worker/                  # Python Laptop Worker Daemon
├── packages/
│   └── shared/                  # Shared constants and schemas
├── docs/                        # Project documentation (local-only guides)
├── scripts/                     # Local developer utility scripts
├── storage/                     # Local file storage (Git-ignored caches)
│   ├── projects/                # Local CAD assets
│   ├── models/                  # SD model checkpoints
│   ├── workflows/               # ComfyUI workflows
│   └── outputs/                 # Locally generated rendering outputs
├── .env.example                 # Environment configuration template
├── .gitignore                   # Safe Git ignore rules
└── README.md                    # System architecture guide
```

---

## Hardware Constraint Enforcement (4GB VRAM Laptop profiles)

RenderPilot is optimized to run safely on Windows gaming laptops with 4GB VRAM (such as an NVIDIA RTX 3050):
- **Batch Size Limit**: Restricts image generation runs to a batch size of `1`.
- **Model Standard**: Utilizes Stable Diffusion 1.5 checkpoints to maintain a low GPU footprint.
- **ControlNet Limit**: Maximum of `1` active ControlNet layer (e.g. depth model extraction) per rendering run.
- **No Training**: Local model training tasks are disabled to prevent graphic driver crashes.
