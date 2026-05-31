# RenderPilot Environment Verification Script
# Verifies system dependencies required for offline rendering workflows

$ErrorActionPreference = "SilentlyContinue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         RenderPilot Environment Diagnostics" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Environment: local Windows Gaming Laptop (RTX 3050)" -ForegroundColor Yellow
Write-Host ""

$testsPassed = 0
$testsFailed = 0
$testsWarning = 0

# Helper function to print diagnostics statuses
function Print-Status {
    param (
        [string]$Component,
        [string]$Status, # OK, FAIL, WARN
        [string]$Message
    )
    switch ($Status) {
        "OK" {
            Write-Host "[ PASS ] " -NoNewline -ForegroundColor Green
            Write-Host "$Component: $Message"
            $script:testsPassed++
        }
        "WARN" {
            Write-Host "[ WARN ] " -NoNewline -ForegroundColor Yellow
            Write-Host "$Component: $Message"
            $script:testsWarning++
        }
        "FAIL" {
            Write-Host "[ FAIL ] " -NoNewline -ForegroundColor Red
            Write-Host "$Component: $Message"
            $script:testsFailed++
        }
    }
}

# Load environmental configs if .env is present
$rootPath = Resolve-Path "$PSScriptRoot\.."
$envPath = "$rootPath\.env"
$blenderPath = "C:\Program Files\Blender Foundation\Blender 4.1\blender.exe"
$comfyPath = "C:\ComfyUI_windows_portable"
$storagePath = "$rootPath\storage"

if (Test-Path $envPath) {
    Get-Content $envPath | Foreach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line.Split("=", 2)
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim()
                $val = $parts[1].Trim()
                if ($key -eq "BLENDER_EXE_PATH") { $blenderPath = $val }
                if ($key -eq "COMFYUI_PATH") { $comfyPath = $val }
                if ($key -eq "PROJECT_STORAGE_PATH") { $storagePath = $val }
            }
        }
    }
    Write-Host "[Info] Loaded local configurations from .env" -ForegroundColor Gray
} else {
    Write-Host "[Info] No .env file found. Falling back to default check parameters." -ForegroundColor Gray
}
Write-Host ""

# 1. Check Git
$gitVer = git --version
if ($LASTEXITCODE -eq 0 -and $gitVer) {
    Print-Status -Component "Git CLI" -Status "OK" -Message $gitVer.Trim()
} else {
    Print-Status -Component "Git CLI" -Status "FAIL" -Message "Git is not installed or not in System PATH."
}

# 2. Check Node.js
$nodeVer = node --version
if ($LASTEXITCODE -eq 0 -and $nodeVer) {
    $verNum = [int]$nodeVer.Trim().Split(".")[0].Replace("v", "")
    if ($verNum -ge 18) {
        Print-Status -Component "Node.js" -Status "OK" -Message "Version $nodeVer (Required v18+)"
    } else {
        Print-Status -Component "Node.js" -Status "WARN" -Message "Version $nodeVer detected. Recommended v18+."
    }
} else {
    Print-Status -Component "Node.js" -Status "FAIL" -Message "Node.js is not installed. Required for web app frontend."
}

# 3. Check pnpm
$pnpmVer = pnpm --version
if ($LASTEXITCODE -eq 0 -and $pnpmVer) {
    Print-Status -Component "pnpm Package Manager" -Status "OK" -Message "Version $pnpmVer"
} else {
    Print-Status -Component "pnpm Package Manager" -Status "WARN" -Message "pnpm is not found. NPM will be used as fallback."
}

# 4. Check Python
$pythonVer = python --version
if ($LASTEXITCODE -eq 0 -and $pythonVer) {
    # Check Python version (recommended 3.10 or 3.11)
    $cleanVer = $pythonVer.Replace("Python ", "").Trim()
    if ($cleanVer.StartsWith("3.10") -or $cleanVer.StartsWith("3.11")) {
        Print-Status -Component "Python Runtime" -Status "OK" -Message "Version $cleanVer (Optimal for torch/stable-diffusion)"
    } else {
        Print-Status -Component "Python Runtime" -Status "WARN" -Message "Version $cleanVer detected. Recommended 3.10 or 3.11 for dependency compatibility."
    }
} else {
    Print-Status -Component "Python Runtime" -Status "FAIL" -Message "Python is not installed or not in System PATH."
}

# 5. Check Blender Path
if (Test-Path $blenderPath) {
    Print-Status -Component "Blender Executable" -Status "OK" -Message "Verified at $blenderPath"
} else {
    Print-Status -Component "Blender Executable" -Status "FAIL" -Message "Executable not found at path: $blenderPath (Check .env configuration)"
}

# 6. Check ComfyUI Folder
if (Test-Path $comfyPath) {
    # Check if models subfolders exist to verify it is a valid comfy installation
    $modelsDir = Join-Path $comfyPath "ComfyUI\models"
    if (Test-Path $modelsDir) {
        Print-Status -Component "ComfyUI Directory" -Status "OK" -Message "Verified at $comfyPath"
    } else {
        Print-Status -Component "ComfyUI Directory" -Status "WARN" -Message "Folder exists at $comfyPath, but subdirectories do not match standard installation."
    }
} else {
    Print-Status -Component "ComfyUI Directory" -Status "FAIL" -Message "ComfyUI directory not found at: $comfyPath (Check .env configuration)"
}

# 7. Check NVIDIA GPU visibility & nvidia-smi
$gpuInfo = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -like "*NVIDIA*" }
$nvidiaSmiPath = "$env:ProgramFiles\NVIDIA Corporation\NVSMI\nvidia-smi.exe"
if (-not (Test-Path $nvidiaSmiPath)) {
    $nvidiaSmiPath = "nvidia-smi"
}

$smiResult = & $nvidiaSmiPath
if ($LASTEXITCODE -eq 0 -and $smiResult) {
    # Parse VRAM details if possible
    $gpuName = $gpuInfo.Name
    if (-not $gpuName) {
        $gpuName = "NVIDIA Device"
    }
    Print-Status -Component "NVIDIA GPU Driver" -Status "OK" -Message "Detected $gpuName (nvidia-smi active)"
} else {
    if ($gpuInfo) {
        Print-Status -Component "NVIDIA GPU Hardware" -Status "WARN" -Message "Detected $($gpuInfo.Name) in system hardware, but nvidia-smi is not accessible."
    } else {
        Print-Status -Component "NVIDIA GPU Hardware" -Status "FAIL" -Message "No NVIDIA GPU detected. An NVIDIA card is required for local neural rendering."
    }
}

# 8. Check CUDA-capable PyTorch Import
if (python -c "import sys; sys.exit(0)" -eq 0) {
    $pyCheckCmd = "import sys; 
try: 
    import torch; 
    avail = torch.cuda.is_available(); 
    vram = torch.cuda.get_device_properties(0).total_memory / (1024**3) if avail else 0;
    print(f'OK|{torch.__version__}|{avail}|{vram:.2f}');
except Exception as e: 
    print(f'ERROR|{str(e)}');"
    
    $checkResult = python -c $pyCheckCmd
    if ($checkResult -and $checkResult.StartsWith("OK")) {
        $parts = $checkResult.Split("|")
        $torchVer = $parts[1]
        $cudaAvail = $parts[2] -eq "True"
        $deviceVram = $parts[3]
        
        if ($cudaAvail) {
            if ([double]$deviceVram -lt 4.5) {
                Print-Status -Component "PyTorch / CUDA" -Status "OK" -Message "Torch version $torchVer with CUDA acceleration active. VRAM: $deviceVram GB (RTX 3050 4GB Profile Safe)."
            } else {
                Print-Status -Component "PyTorch / CUDA" -Status "OK" -Message "Torch version $torchVer with CUDA active. VRAM: $deviceVram GB."
            }
        } else {
            Print-Status -Component "PyTorch / CUDA" -Status "FAIL" -Message "Torch is installed, but CUDA acceleration is NOT active. CPU-only rendering will crash under pipeline load."
        }
    } else {
        Print-Status -Component "PyTorch / CUDA" -Status "FAIL" -Message "PyTorch dependency check failed: $($checkResult.Replace('ERROR|', ''))"
    }
} else {
    Print-Status -Component "PyTorch / CUDA" -Status "FAIL" -Message "PyTorch check skipped because Python is not available."
}

# 9. Free Disk Space Validation (Verify drive containing project storage)
$storageDrive = "C"
if ($storagePath -match "^([A-Za-z]):") {
    $storageDrive = $Matches[1]
}
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($storageDrive):'"
if ($disk) {
    $freeGB = [math]::Round($disk.FreeSpace / 1GB, 2)
    if ($freeGB -ge 20) {
        Print-Status -Component "Disk Space ($storageDrive:)" -Status "OK" -Message "$freeGB GB free (Recommended min: 20GB for checkpoint storage)"
    } else {
        Print-Status -Component "Disk Space ($storageDrive:)" -Status "WARN" -Message "Only $freeGB GB free. Stable Diffusion model checkpoints require significant disk storage."
    }
} else {
    Print-Status -Component "Disk Space" -Status "WARN" -Message "Failed to fetch disk space details for drive $storageDrive:"
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "                    Diagnostics Summary" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Passed checks  : $testsPassed" -ForegroundColor Green
Write-Host "  Warnings found : $testsWarning" -ForegroundColor Yellow
Write-Host "  Failed checks  : $testsFailed" -ForegroundColor Red
Write-Host "==========================================================" -ForegroundColor Cyan

if ($testsFailed -gt 0) {
    Write-Host ""
    Write-Host "[Action Required] Please resolve failed components before starting workers." -ForegroundColor Red
    Write-Host "See docs/setup-windows.md for installation instructions." -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "[Success] Environment passes basic visualization worker specifications." -ForegroundColor Green
    exit 0
}
