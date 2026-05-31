import os
import sys
from dataclasses import dataclass

# Load environment variables from .env file if available, traversing upwards
try:
    from dotenv import load_dotenv, find_dotenv
    load_dotenv(find_dotenv())
except ImportError:
    pass

@dataclass(frozen=True)
class WorkerConfig:
    DATABASE_URL: str
    WORKER_ID: str
    WORKER_NAME: str
    COMFYUI_URL: str
    BLENDER_PATH: str
    LOCAL_WORKSPACE_ROOT: str
    STORAGE_PROVIDER: str
    STORAGE_BUCKET: str
    AWS_REGION: str
    AWS_S3_BUCKET: str
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str

REQUIRED_WORKER_ENV_VARS = [
    'DATABASE_URL',
    'WORKER_ID',
    'WORKER_NAME',
    'COMFYUI_URL',
    'BLENDER_PATH',
    'LOCAL_WORKSPACE_ROOT',
    'STORAGE_PROVIDER',
    'STORAGE_BUCKET',
    'AWS_REGION',
    'AWS_S3_BUCKET',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
]

def validate_config() -> WorkerConfig:
    missing = []
    for var in REQUIRED_WORKER_ENV_VARS:
        val = os.environ.get(var)
        if not val or not val.strip():
            missing.append(var)
            
    if missing:
        error_msg = f"[Configuration Error] Missing required worker environment variables: {', '.join(missing)}"
        print(error_msg, file=sys.stderr)
        raise ValueError(error_msg)
        
    return WorkerConfig(
        DATABASE_URL=os.environ['DATABASE_URL'],
        WORKER_ID=os.environ['WORKER_ID'],
        WORKER_NAME=os.environ['WORKER_NAME'],
        COMFYUI_URL=os.environ['COMFYUI_URL'],
        BLENDER_PATH=os.environ['BLENDER_PATH'],
        LOCAL_WORKSPACE_ROOT=os.environ['LOCAL_WORKSPACE_ROOT'],
        STORAGE_PROVIDER=os.environ['STORAGE_PROVIDER'],
        STORAGE_BUCKET=os.environ['STORAGE_BUCKET'],
        AWS_REGION=os.environ['AWS_REGION'],
        AWS_S3_BUCKET=os.environ['AWS_S3_BUCKET'],
        AWS_ACCESS_KEY_ID=os.environ['AWS_ACCESS_KEY_ID'],
        AWS_SECRET_ACCESS_KEY=os.environ['AWS_SECRET_ACCESS_KEY'],
    )

# Validate at module load time to ensure we halt startup if variables are missing
config = validate_config()
