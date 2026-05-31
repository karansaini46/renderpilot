# Shared constant variables and configurations for RenderPilot services

# VRAM hardware parameters (NVIDIA RTX 3050 - 4GB safe limits)
MAX_BATCH_SIZE = 1
MAX_CONTROLNET_LAYERS = 1

# Queue states
STATUS_PENDING = "PENDING"
STATUS_PROCESSING = "PROCESSING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"
