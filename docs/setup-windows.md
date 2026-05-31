# Windows Laptop Workstation Setup Guide

This guide details instructions for setting up a local rendering workstation on a Windows gaming laptop. The system is designed to run offline and fits within a **4GB VRAM** envelope (such as an NVIDIA GeForce RTX 3050 laptop GPU).

---

## Hardware Optimization Guidelines (4GB VRAM Containment)

To execute architectural renders on a 4GB VRAM laptop without triggering CUDA Out-Of-Memory (OOM) exceptions, the following guidelines are configured by default:
- **Batch Size Limit**: Enforced to `1` image generation per job.
- **Model Baseline**: Standardizes on Stable Diffusion 1.5 (SD 1.5) checkpoints, which consume ~2.0 GB VRAM.
- **ControlNet Count**: Locked to a maximum of `1` active ControlNet layer (e.g., Depth or Canny).
- **No Local Training**: Automated model fine-tuning (LoRA training) is excluded from the MVP.
- **Storage Strategy**: All heavy rendering output frames and model checkpoints are saved directly to the local filesystem (`storage/` directory), keeping the project metadata database (SQLite) lightweight.

---

## Prerequisites & Installation

### Step 1: Install Git CLI
1. Download Git from [git-scm.com](https://git-scm.com/download/win).
2. Run the installer and keep the default options. Verify that Git is added to your Windows PATH.

### Step 2: Install Node.js & pnpm
1. Download Node.js LTS (v18 or v20) from [nodejs.org](https://nodejs.org/).
2. Once Node is installed, open PowerShell and run this command to install the `pnpm` package manager:
   ```powershell
   npm install -g pnpm
   ```

### Step 3: Install Python Runtime
1. Download **Python 3.10.x** or **Python 3.11.x** from [python.org](https://www.python.org/downloads/windows/).
2. **IMPORTANT**: During installation, check the box that says **"Add Python to PATH"** before proceeding.
3. Install PyTorch with CUDA support. Open PowerShell and execute:
   ```powershell
   pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu121
   ```

### Step 4: Install Blender
1. Download Blender v4.0 or newer from [blender.org](https://www.blender.org/download/).
2. Note the path to the executable (default path: `C:\Program Files\Blender Foundation\Blender 4.1\blender.exe`).

### Step 5: Install ComfyUI (Local Rendering Pipeline)
1. Download the ComfyUI Windows Portable zip file from the [ComfyUI Releases GitHub Page](https://github.com/comfyanonymous/ComfyUI#windows).
2. Extract the folder to a local directory (e.g., `C:\ComfyUI_windows_portable`).
3. Download the base Stable Diffusion 1.5 checkpoint (`v1-5-pruned-emaonly.safetensors` or similar) from Hugging Face or another model repository.
4. Place the `.safetensors` file inside the model checkpoints directory:
   `C:\ComfyUI_windows_portable\ComfyUI\models\checkpoints\`

---

## Project Configuration

1. Copy the environment variables template at the root of the workspace:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Open `.env` and fill out the absolute paths to match your system configurations:
   - `BLENDER_EXE_PATH`: Absolute path to `blender.exe`.
   - `COMFYUI_PATH`: Path to your ComfyUI root folder.
   - `PROJECT_STORAGE_PATH`: Absolute path to this repository's `storage` folder.

---

## Verifying the Workstation Environment

To test that all tools, paths, PyTorch CUDA extensions, and hardware settings are correctly configured, run the diagnostic script in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check_environment.ps1
```

### Understanding the Scorecard Output

The script outputs a diagnostic matrix:
- **`Git CLI` / `Node.js` / `pnpm`**: Asserts that dependencies are correctly registered in the system environment.
- **`Python Runtime`**: Confirms that python is running and warns if the version is not optimized for neural model dependencies.
- **`Blender Executable` / `ComfyUI Directory`**: Verifies that paths declared in your `.env` resolve to local folders.
- **`NVIDIA GPU Driver`**: Checks for an NVIDIA graphics controller and tests communications.
- **`PyTorch / CUDA`**: Imports PyTorch in Python, queries CUDA accessibility, and outputs active GPU VRAM details to ensure compatibility.
- **`Disk Space`**: Asserts that the target disk has at least 20GB of free space.
