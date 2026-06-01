# RenderPilot Storage Architecture

RenderPilot utilizes a decoupled cloud-and-local storage topology designed to optimize client-side workstation loads, conserve system resources, and ensure robust file serving under severe hardware constraints (such as a 4GB RTX 3050 VRAM laptop workstation).

---

## 1. Storage Operations Paradigm

The system implements a unified **Storage Adapter** interface (`StorageAdapter`) with two concrete implementations:

1. **S3 Storage Adapter** (Production / Cloud): Integrates with S3-compatible cloud storage buckets (e.g., Cloudflare R2, Backblaze B2, or AWS S3).
2. **Local Filesystem Adapter** (Development / Offline): Writes directly to the local `/storage` caches on disk via Next.js mock API routers.

### Cloud Gateway Database Footprint

To prevent memory leaks and transaction overheads, **no binary files are stored inside the Neon PostgreSQL database**. 
- The database stores strictly **object keys** and **public/signed retrieval URLs** (saved in the `file_url` column of the `project_files` and `renders` tables).
- File assets delivery and uploads are completely delegated to the S3-compatible object storage gateway.

---

## 2. Optimizing Workstation Load via Object Storage

Hosting rendering visualization operations on a private workstation laptop introduces significant networking and resource bottlenecks:
- **Bandwidth Constraints**: Home or office internet connections have limited upstream bandwidth. If the web console had to fetch rendering passes directly from a server running on the laptop, the laptop would saturate its upload capacity, slowing down the worker client.
- **Port Forwarding & Firewalls**: Local hosting would require exposing local ports to the internet (NAT traversal, DDNS, or VPN setups), presenting major security risks.
- **Resource Contention**: Serving heavy binary data (like 150MB+ `.blend` files or large `.glb` assets) to web users puts heavy CPU and Disk I/O load on the workstation while it is already rendering graphics.

### The Decoupled Push/Pull Pipeline

RenderPilot solves this by utilizing the cloud storage bucket as an intermediary staging buffer:

```
[Web Console UI]             [Object Storage Bucket]             [Laptop Workstation]
       │                                │                                  │
       ├──── 1. Uploads .blend ────────>│                                  │
       │     (via Presigned PUT URL)    │                                  │
       │                                │                                  │
       │                                ├──── 2. Downloads CAD inputs ────>│
       │                                │     (via Presigned GET URL)      │
       │                                │                                  │
       │                                │     [Runs Local Rendering]       │
       │                                │                                  │
       │                                <──── 3. Uploads render frames ────┤
       │                                │     (via boto3 PUT command)      │
       │                                │                                  │
       <──── 4. Displays outputs ───────┤                                  │
             (via Signed GET URL)       │                                  │
```

1. **Passive Client Model**: The laptop worker functions strictly as a client, making outgoing calls to poll jobs. It never acts as a web host.
2. **Offloaded Delivery**: The Vercel console signs uploads and downloads. Heavy binary assets are uploaded directly from the browser to the cloud bucket, and the worker downloads them from the bucket.
3. **Minimized Disk & CPU Overhead**: The worker's CPU and disk cycles are dedicated entirely to processing geometry and rendering graphics, completely eliminating web-serving overhead.
