# RenderPilot Vercel Deployment Documentation

This guide describes how to deploy the RenderPilot Next.js web application (`apps/web`) to Vercel, including the required environment variables and build configurations.

---

## 1. Vercel Build Settings

When importing the repository on Vercel, configure the project with the following settings:

- **Framework Preset**: Next.js
- **Root Directory**: `.` (monorepo root)
- **Build Command**: `pnpm run build`
- **Output Directory**: `apps/web/.next`
- **Install Command**: `pnpm install`

---

## 2. Required Environment Variables

Configure the following environment variables in the Vercel Dashboard under **Project Settings > Environment Variables**:

| Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | Neon PostgreSQL cloud brain connection string (including pooling options/ssl) | `postgres://user:pass@ep-fancy-river.us-east-1.aws.neon.tech/neondb?sslmode=require` |
| `STORAGE_PROVIDER` | Object storage provider (use `cloudflare_r2` or `s3`) | `cloudflare_r2` |
| `STORAGE_BUCKET` | Public bucket name for rendering assets and outputs | `renderpilot-assets` |
| `STORAGE_PUBLIC_BASE_URL` | Public CDN base URL for downloading uploaded assets | `https://pub-your-id.r2.dev` |
| `AWS_REGION` | AWS S3 / Cloudflare R2 region configuration | `us-east-1` (or `auto` for Cloudflare R2) |
| `AWS_S3_BUCKET` | Private S3 bucket name (used for secure/non-public files) | `renderpilot-private-bucket` |
| `AWS_ACCESS_KEY_ID` | Access key ID for S3/R2 client authentication | `your-access-key-id` |
| `AWS_SECRET_ACCESS_KEY` | Secret access key for S3/R2 client authentication | `your-secret-access-key` |

---

## 3. Serverless Architectural Guarantees

The RenderPilot web console is designed to run in serverless environments:
- **No Heavy Operations**: All CPU-intensive rendering tasks (ComfyUI workflows, Blender command lines, image pre-processing) run asynchronously on private Windows laptop worker daemons, never blocking serverless execution contexts.
- **Short-Running API Routes**: Server routes only poll/update metadata, record database statuses, and issue presigned URLs. Maximum route execution is under 2 seconds.
- **Cloud-Direct Binary Uploads**: File uploads utilize the `/api/storage/upload-url` endpoint to retrieve presigned S3/R2 direct upload targets. Binaries are uploaded directly from client browsers to object storage, bypassing the Vercel ephemeral local disk completely.
