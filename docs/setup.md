# RenderPilot System Setup Checklist

This document details the configuration requirements and step-by-step setup checklist for deploying the RenderPilot architectural visualization platform using a decoupled cloud-gateway and private local-worker architecture.

---

## 1. Cloud Database Setup (Neon PostgreSQL)

RenderPilot uses **Neon PostgreSQL** as the persistent cloud datastore. It stores project metadata, render jobs queue statuses, worker system heartbeats, and user feedback logs.

- [ ] Sign up for a free-tier database instance on [neon.tech](https://neon.tech/).
- [ ] Create a new project named `renderpilot`.
- [ ] Retrieve the database connection string from the Neon dashboard.
- [ ] Configure connection parameters to utilize SSL (required by Neon).
- [ ] Test connection status using an external database manager.

---

## 2. Frontend Hosting Setup (Vercel)

The management console UI is hosted on **Vercel** for high availability and low latency.

- [ ] Register/login on [vercel.com](https://vercel.com).
- [ ] Import your Git repository branch (`main`) into a new Vercel project.
- [ ] Set up the build command configurations:
  - Framework Preset: **Next.js**
  - Root Directory: `apps/web`
- [ ] Configure the project's environment variables in the Vercel dashboard (see the Environment Variables checklist below).
- [ ] Deploy the application and note your public production domain address (e.g. `https://renderpilot.vercel.app`).

---

## 3. Object Storage Setup (S3-Compatible Free Tier)

Heavy binary files—such as base architectural designs, extracted geometry passes, and finished render frames—are stored in an S3-compatible object storage bucket (e.g., Cloudflare R2 free tier, Backblaze B2, or AWS S3 free tier) rather than inside the database.

- [ ] Create an account with a cloud storage provider (e.g., Cloudflare R2).
- [ ] Provision a new private bucket named `renderpilot-assets`.
- [ ] Generate API keys (Access Key ID and Secret Access Key) with read/write permissions for the bucket.
- [ ] Obtain the public/private endpoint URL for S3 client initialization.
- [ ] Set bucket CORS permissions to allow requests from your Vercel frontend domain.

---

## 4. Laptop Worker Setup (Local Windows Client)

The heavy image processing runs on a private Windows laptop workstation. The worker daemon runs locally as a client, pulling render jobs from the Neon cloud database and executing them entirely offline.

- [ ] Install Git, Python (v3.10/3.11), Node.js, and pnpm on the laptop.
- [ ] Clone this repository to the local workstation.
- [ ] Verify that PyTorch with CUDA acceleration is active by testing the GPU drivers.
- [ ] Configure the local path settings in `.env` (see the Environment Variables checklist).
- [ ] Establish directory structures inside the ComfyUI installation and download standard Stable Diffusion models.

---

## 5. Environment Variable Templates

To configure the communication channels between the Vercel console, Neon database, Object Storage, and the Laptop worker, the following environment variables must be declared.

### Cloud Gateway Configuration (Vercel / API Server)
- `DATABASE_URL`: Connection string to the Neon PostgreSQL database.
- `OBJECT_STORAGE_ENDPOINT`: S3-compatible bucket API endpoint.
- `OBJECT_STORAGE_BUCKET`: Name of your storage bucket (e.g., `renderpilot-assets`).
- `OBJECT_STORAGE_ACCESS_KEY_ID`: Access credential for the bucket.
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`: Secret credential for the bucket.

### Local Laptop Worker Configuration (`.env`)
- `API_URL`: Public address of the Cloud Gateway API server.
- `BLENDER_EXE_PATH`: Path to the local `blender.exe` binary.
- `COMFYUI_URL`: Local address of the ComfyUI server API (default: `http://127.0.0.1:8188`).
- `COMFYUI_PATH`: Path to your local ComfyUI root directory.
- `PROJECT_STORAGE_PATH`: Absolute path to the local cache storage folder.
- `DATABASE_URL`: Connection string to the Neon PostgreSQL cloud database (so the worker can poll the jobs table directly or via API).

---

## 6. VRAM Safeguard Rules Profile (4GB RTX 3050 Class Laptop)

To guarantee the local laptop worker runs safely without hitting graphics driver crashes, the following runtime boundaries must be enforced:

1. **Batch Size Containment**:
   - Enforce `batch_size = 1` for all generation jobs. Larger batch counts will crash a 4GB card.
2. **Stable Diffusion Version**:
   - Primary operations must default to Stable Diffusion 1.5 (SD 1.5) checkpoints, which consume ~2.0 GB VRAM.
3. **ControlNet Boundary**:
   - Maximum of `1` active ControlNet layer (e.g., Depth or Canny edge detection map) per render run.
4. **Training Restriction**:
   - Automatic local model fine-tuning (such as LoRA training) is disabled.
5. **Asset Cleanup**:
   - Intermediate geometry passes and raw inputs must be cleared from local storage once they are uploaded to the Object Storage bucket.
