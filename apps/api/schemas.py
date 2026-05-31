from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
import datetime

# Helper to load dict values from serialized JSON fields
class JsonSettingsBase(BaseModel):
    settings: Optional[Dict[str, Any]] = None


# --- PROJECT SCHEMAS ---
class ProjectBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    project_type: str = Field("Exterior", description="e.g. Interior, Exterior")
    input_type: str = Field("CAD", description="e.g. CAD, Sketch, Wireframe")
    status: str = Field("ACTIVE")

class ProjectCreate(ProjectBase):
    id: str

class ProjectResponse(ProjectBase):
    id: str
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


# --- ASSET SCHEMAS ---
class AssetBase(BaseModel):
    file_path: str
    asset_type: str
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

class AssetCreate(AssetBase):
    id: str
    project_id: str

class AssetResponse(AssetBase):
    id: str
    project_id: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# --- MATERIAL SCHEMAS ---
class MaterialBase(BaseModel):
    object_name: str
    detected_class: str
    selected_material: str
    confidence: float
    locked: bool = False
    correction_source: Optional[str] = None

class MaterialCreate(MaterialBase):
    id: str
    project_id: str

class MaterialUpdate(BaseModel):
    selected_material: str
    locked: bool
    correction_source: str

class MaterialResponse(MaterialBase):
    id: str
    project_id: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# --- STYLE SCHEMAS ---
class StyleBase(BaseModel):
    name: str
    prompt_template: str
    negative_prompt: Optional[str] = None
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict)
    active: bool = True

class StyleCreate(StyleBase):
    id: str

class StyleResponse(StyleBase):
    id: str

    class Config:
        from_attributes = True


# --- RENDER JOB SCHEMAS ---
class RenderJobCreate(BaseModel):
    id: str
    project_id: str
    job_type: str
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict)

    # Validation limit checks for RTX 3050 hardware safety
    @field_validator("settings")
    @classmethod
    def validate_vram_limits(cls, val: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if val:
            batch_size = val.get("batch_size", 1)
            controlnet_layers = val.get("controlnet_layers", 1)
            
            if batch_size != 1:
                raise ValueError("VRAM Safety: batch_size must be exactly 1.")
            if controlnet_layers > 1:
                raise ValueError("VRAM Safety: controlnet_layers cannot exceed 1.")
        return val

class RenderJobResponse(BaseModel):
    id: str
    project_id: str
    job_type: str
    status: str
    progress: int
    error_message: Optional[str]
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict)
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime]

    class Config:
        from_attributes = True


# --- RENDERS SCHEMAS ---
class RenderCreate(BaseModel):
    id: str
    project_id: str
    prompt: str
    style_id: Optional[str] = None
    base_image_path: Optional[str] = None
    final_image_path: str
    depth_path: Optional[str] = None
    canny_path: Optional[str] = None
    normal_path: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict)

    @field_validator("settings")
    @classmethod
    def validate_render_settings(cls, val: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if val:
            batch_size = val.get("batch_size", 1)
            controlnet_layers = val.get("controlnet_layers", 1)
            if batch_size != 1:
                raise ValueError("VRAM Safety: batch_size must be exactly 1.")
            if controlnet_layers > 1:
                raise ValueError("VRAM Safety: controlnet_layers cannot exceed 1.")
        return val

class RenderResponse(BaseModel):
    id: str
    project_id: str
    base_image_path: Optional[str]
    final_image_path: str
    depth_path: Optional[str]
    canny_path: Optional[str]
    normal_path: Optional[str]
    style_id: Optional[str]
    prompt: str
    negative_prompt: Optional[str]
    seed: Optional[int]
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict)
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# --- FEEDBACK SCHEMAS ---
class FeedbackCreate(BaseModel):
    id: str
    render_id: str
    approved: bool
    rating: Optional[int] = Field(None, ge=1, le=5)
    geometry_score: Optional[int] = Field(None, ge=1, le=5)
    lighting_score: Optional[int] = Field(None, ge=1, le=5)
    material_score: Optional[int] = Field(None, ge=1, le=5)
    realism_score: Optional[int] = Field(None, ge=1, le=5)
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None

class FeedbackResponse(BaseModel):
    id: str
    render_id: str
    approved: bool
    rating: Optional[int]
    geometry_score: Optional[int]
    lighting_score: Optional[int]
    material_score: Optional[int]
    realism_score: Optional[int]
    rejection_reason: Optional[str]
    notes: Optional[str]
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# --- MEMORY RULES SCHEMAS ---
class MemoryRuleCreate(BaseModel):
    id: str
    scope: str
    key: str
    value: Dict[str, Any]
    score: float = 0.0
    source_render_id: Optional[str] = None

class MemoryRuleResponse(BaseModel):
    id: str
    scope: str
    key: str
    value: Dict[str, Any]
    score: float
    source_render_id: Optional[str]
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# --- TRAINING SAMPLE SCHEMAS ---
class TrainingSampleCreate(BaseModel):
    id: str
    render_id: str
    style_id: str
    image_path: str
    caption: Optional[str] = None
    quality_score: Optional[float] = None
    approved_for_training: bool = False

class TrainingSampleResponse(BaseModel):
    id: str
    render_id: str
    style_id: str
    image_path: str
    caption: Optional[str]
    quality_score: Optional[float]
    approved_for_training: bool
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# --- LORA VERSION SCHEMAS ---
class LoraVersionCreate(BaseModel):
    id: str
    style_id: str
    version_name: str
    file_path: str
    dataset_size: Optional[int] = None
    benchmark_score: Optional[float] = None
    active: bool = True

class LoraVersionResponse(BaseModel):
    id: str
    style_id: str
    version_name: str
    file_path: str
    dataset_size: Optional[int]
    benchmark_score: Optional[float]
    active: bool
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# --- HARDWARE STATUS ---
class SystemStatusResponse(BaseModel):
    api_status: str
    blender_configured: bool
    blender_path: Optional[str]
    comfyui_configured: bool
    comfyui_url: str
    vram_profile: str
    max_batch_size: int
    max_controlnets: int
