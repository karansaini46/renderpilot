from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
import datetime

# --- PROJECT SCHEMAS ---
class ProjectBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    source_file: str = Field(..., description="Local .blend filepath or filename")

class ProjectCreate(ProjectBase):
    id: str = Field(..., description="Unique alphanumeric identifier")

class ProjectResponse(ProjectBase):
    id: str
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


# --- RENDER JOB SCHEMAS ---
class RenderJobCreate(BaseModel):
    id: str
    project_id: str
    preset_name: str
    prompt: str = Field(..., min_length=1)
    negative_prompt: Optional[str] = None
    
    # Restrict batch size and ControlNet layers at Pydantic level to protect local 4GB VRAM
    batch_size: int = Field(1, description="Number of images to generate (must be 1 for RTX 3050)")
    controlnet_layers: int = Field(1, description="Number of concurrent ControlNet modules (max 1)")

    @field_validator("batch_size")
    @classmethod
    def validate_batch_size(cls, value: int) -> int:
        if value != 1:
            raise ValueError(
                "VRAM limit protection active: batch_size must be exactly 1 for 4GB hardware."
            )
        return value

    @field_validator("controlnet_layers")
    @classmethod
    def validate_controlnet_layers(cls, value: int) -> int:
        if value > 1:
            raise ValueError(
                "VRAM limit protection active: controlnet_layers cannot exceed 1 on 4GB hardware."
            )
        return value


class RenderJobResponse(BaseModel):
    id: str
    project_id: str
    status: str
    preset_name: str
    prompt: str
    negative_prompt: Optional[str]
    batch_size: int
    controlnet_layers: int
    output_image_path: Optional[str]
    error_message: Optional[str]
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime]

    class Config:
        from_attributes = True


# --- HARDWARE STATUS SCHEMAS ---
class SystemStatusResponse(BaseModel):
    api_status: str
    blender_configured: bool
    blender_path: Optional[str]
    comfyui_configured: bool
    comfyui_url: str
    vram_profile: str
    max_batch_size: int
    max_controlnets: int
