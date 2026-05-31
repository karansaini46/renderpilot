# RenderPilot Local Development Orchestrator
# Enforces RTX 3050 VRAM profiles and starts application modules

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "       RenderPilot Dev Environment Loader" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Platform Target: Local Windows (RTX 3050 4GB VRAM)" -ForegroundColor Yellow
Write-Host ""

# Check for .env file
$rootPath = Resolve-Path "$PSScriptRoot\.."
$envFile = "$rootPath\.env"
$envExample = "$rootPath\.env.example"

if (-not (Test-Path $envFile)) {
    Write-Host "[Info] .env file not found. Initializing from .env.example..." -ForegroundColor Gray
    Copy-Item $envExample $envFile
    Write-Host "[Success] Configured default .env. Please update paths to local executables if necessary." -ForegroundColor Green
}

# Define command runner helpers
function Start-DevService {
    param(
        [string]$Name,
        [string]$Dir,
        [string]$Command,
        [string]$Args
    )
    Write-Host "[Orchestrator] Starting $Name..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Dir'; Write-Host '--- Starting $Name ---' -ForegroundColor Green; $Command $Args"
}

# Start backend FastAPI app
$apiDir = "$rootPath\apps\api"
$apiCmd = "if (Test-Path .\venv) { .\venv\Scripts\activate.ps1 } else { Write-Host 'Virtual env not found. Running with global python...' -ForegroundColor Yellow }; uvicorn main:app --reload --port 8000"
Start-DevService -Name "FastAPI Core API" -Dir $apiDir -Command $apiCmd

# Start frontend Next.js app
$webDir = "$rootPath"
$webCmd = "npm run dev:web"
Start-DevService -Name "Next.js Web Frontend" -Dir $webDir -Command $webCmd

# Start Blender worker
$blenderDir = "$rootPath\workers\blender_worker"
$blenderCmd = "if (Test-Path .\venv) { .\venv\Scripts\activate.ps1 }; python worker.py"
Start-DevService -Name "Blender Render Worker" -Dir $blenderDir -Command $blenderCmd

# Start ComfyUI worker
$comfyDir = "$rootPath\workers\comfy_worker"
$comfyCmd = "if (Test-Path .\venv) { .\venv\Scripts\activate.ps1 }; python worker.py"
Start-DevService -Name "ComfyUI Pipeline Worker" -Dir $comfyDir -Command $comfyCmd

Write-Host ""
Write-Host "[Success] All RenderPilot services requested." -ForegroundColor Green
Write-Host "  - Next.js: http://localhost:3000" -ForegroundColor Gray
Write-Host "  - FastAPI: http://localhost:8000" -ForegroundColor Gray
Write-Host "  - API Docs: http://localhost:8000/docs" -ForegroundColor Gray
Write-Host "Please monitor the open console windows for process logs." -ForegroundColor Gray
Write-Host "====================================================" -ForegroundColor Cyan
