# RenderPilot Roadmap: Image-First (v1) and Blender Model (v2) Pipeline

This document details the architectural design and roadmap for RenderPilot's rendering strategies, progressing from v1 (Image-First) to v2 (Blender Model integration).

---

## 1. Phase v1: Image-First Workflow (Current Production)

The v1 pipeline is optimized to keep local GPU rendering requirements lightweight, fast, and laptop-safe.

- **Input**: A 2D design layout sketch, architectural drawing, or photograph.
- **Local Pre-processing**: 
  - The worker retrieves the input image and generates a lightweight **Canny edge control map** locally using PIL.
  - This avoids running heavy neural preprocessors (like Midas/Depth estimators) on the laptop GPU during basic preview passes.
- **Rendering**:
  - The local image and preprocessed Canny edge map are uploaded to the ComfyUI API server.
  - Generates preview rendering variations sequentially using standard Stable Diffusion img2img.
- **Advantages**: Minimal local overhead, works on 4GB VRAM consumer gaming laptops, requires no 3D rendering setup.

---

## 2. Phase v2: Blender Model Pipeline (Planned Expansion)

The v2 pipeline introduces 3D CAD/Blender model integration to provide pixel-perfect structural layouts, avoiding the hallucinations common to 2D image preprocessors.

- **Input**: A 3D CAD design or Blender scene file (`.blend` format) uploaded by the architect.
- **Local Pre-processing (Blender Headless)**:
  - The local worker locates the configured `BLENDER_PATH` executable.
  - Launches an automated headless Blender execution script to load the `.blend` file.
  - Renders and exports four distinct spatial passes to a local job workspace:
    1. **Base Render**: Flat-shaded model preview representing primary colors and basic textures.
    2. **Depth Map**: Grayscale depth pass representing pixel-by-pixel spatial distances.
    3. **Line Map**: Sharp line art wireframe extraction (e.g. via Blender Freestyle) representing layout boundaries.
    4. **Normal Map**: Normal vectors pass representing surface orientations.
- **Rendering**:
  - Uploads the exported passes to the cloud and utilizes them in ComfyUI using **Multi-ControlNet** (combining Canny, Depth, and Normal layers) for structurally accurate visualizations.
- **Status**: Disabled by default behind the `BLENDER_PIPELINE_ENABLED` feature flag.

---

## 3. Worker Module Skeleton and Feature Flag

To facilitate local testing and roadmap verification:
- A worker skeleton has been implemented in `apps/worker/blender_pipeline.py`.
- Both the web application server routes and the worker process loop enforce the `BLENDER_PIPELINE_ENABLED` feature flag.
- **Default State**: Disabled (`false`). Jobs submitted with type `base_render_model` are immediately routed to `needs_review` with a clear explanation, preventing accidental local lockups.
- **Testing State**: When `BLENDER_PIPELINE_ENABLED=true` is set, the worker simulates Blender execution and outputs four mock spatial maps into the local workspace folder under `storage/blender_jobs/<job-id>`.
