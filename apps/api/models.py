import datetime
import json
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    project_type = Column(String, nullable=False) # e.g. Exterior, Interior
    input_type = Column(String, nullable=False)   # e.g. CAD, Sketch, Wireframe
    status = Column(String, nullable=False)       # e.g. ACTIVE, ARCHIVED
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    assets = relationship("Asset", back_populates="project", cascade="all, delete-orphan")
    materials = relationship("Material", back_populates="project", cascade="all, delete-orphan")
    render_jobs = relationship("RenderJob", back_populates="project", cascade="all, delete-orphan")
    renders = relationship("Render", back_populates="project", cascade="all, delete-orphan")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String, nullable=False)
    asset_type = Column(String, nullable=False)   # e.g. BLEND, DEPTH_MAP, RENDER_RESULT
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="assets")

    @property
    def metadata(self):
        try:
            return json.loads(self.metadata_json) if self.metadata_json else {}
        except Exception:
            return {}

    @metadata.setter
    def metadata(self, value):
        self.metadata_json = json.dumps(value) if value else "{}"


class Material(Base):
    __tablename__ = "materials"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    object_name = Column(String, nullable=False)
    detected_class = Column(String, nullable=False)
    selected_material = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    locked = Column(Boolean, default=False)
    correction_source = Column(String, nullable=True) # e.g. USER, HEURISTIC
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="materials")


class Style(Base):
    __tablename__ = "styles"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    prompt_template = Column(Text, nullable=False)
    negative_prompt = Column(Text, nullable=True)
    settings_json = Column(Text, default="{}")
    active = Column(Boolean, default=True)

    # Relationships
    renders = relationship("Render", back_populates="style")
    training_samples = relationship("TrainingSample", back_populates="style")
    lora_versions = relationship("LoraVersion", back_populates="style")

    @property
    def settings(self):
        try:
            return json.loads(self.settings_json) if self.settings_json else {}
        except Exception:
            return {}

    @settings.setter
    def settings(self, value):
        self.settings_json = json.dumps(value) if value else "{}"


class RenderJob(Base):
    __tablename__ = "render_jobs"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    job_type = Column(String, nullable=False)      # e.g. GEOMETRY_EXTRACTION, INFERENCE
    status = Column(String, nullable=False)        # PENDING, RUNNING, COMPLETED, FAILED
    progress = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    settings_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    project = relationship("Project", back_populates="render_jobs")

    @property
    def settings(self):
        try:
            return json.loads(self.settings_json) if self.settings_json else {}
        except Exception:
            return {}

    @settings.setter
    def settings(self, value):
        self.settings_json = json.dumps(value) if value else "{}"


class Render(Base):
    __tablename__ = "renders"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    base_image_path = Column(String, nullable=True)
    final_image_path = Column(String, nullable=False)
    depth_path = Column(String, nullable=True)
    canny_path = Column(String, nullable=True)
    normal_path = Column(String, nullable=True)
    style_id = Column(String, ForeignKey("styles.id", ondelete="SET NULL"), nullable=True)
    prompt = Column(Text, nullable=False)
    negative_prompt = Column(Text, nullable=True)
    seed = Column(Integer, nullable=True)
    settings_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="renders")
    style = relationship("Style", back_populates="renders")
    feedback = relationship("Feedback", uselist=False, back_populates="render", cascade="all, delete-orphan")
    training_samples = relationship("TrainingSample", back_populates="render", cascade="all, delete-orphan")

    @property
    def settings(self):
        try:
            return json.loads(self.settings_json) if self.settings_json else {}
        except Exception:
            return {}

    @settings.setter
    def settings(self, value):
        self.settings_json = json.dumps(value) if value else "{}"


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(String, primary_key=True, index=True)
    render_id = Column(String, ForeignKey("renders.id", ondelete="CASCADE"), nullable=False)
    approved = Column(Boolean, default=False)
    rating = Column(Integer, nullable=True)        # e.g. 1 to 5 stars
    geometry_score = Column(Integer, nullable=True)
    lighting_score = Column(Integer, nullable=True)
    material_score = Column(Integer, nullable=True)
    realism_score = Column(Integer, nullable=True)
    rejection_reason = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    render = relationship("Render", back_populates="feedback")


class MemoryRule(Base):
    __tablename__ = "memory_rules"

    id = Column(String, primary_key=True, index=True)
    scope = Column(String, nullable=False)         # e.g. Project-wide, Global
    key = Column(String, nullable=False)           # e.g. "concrete_material_preference"
    value_json = Column(Text, nullable=False)
    score = Column(Float, default=0.0)
    source_render_id = Column(String, ForeignKey("renders.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    source_render = relationship("Render")

    @property
    def value(self):
        try:
            return json.loads(self.value_json) if self.value_json else {}
        except Exception:
            return {}

    @value.setter
    def value(self, val):
        self.value_json = json.dumps(val) if val else "{}"


class TrainingSample(Base):
    __tablename__ = "training_samples"

    id = Column(String, primary_key=True, index=True)
    render_id = Column(String, ForeignKey("renders.id", ondelete="CASCADE"), nullable=False)
    style_id = Column(String, ForeignKey("styles.id", ondelete="CASCADE"), nullable=False)
    image_path = Column(String, nullable=False)
    caption = Column(Text, nullable=True)
    quality_score = Column(Float, nullable=True)
    approved_for_training = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    render = relationship("Render", back_populates="training_samples")
    style = relationship("Style", back_populates="training_samples")


class LoraVersion(Base):
    __tablename__ = "lora_versions"

    id = Column(String, primary_key=True, index=True)
    style_id = Column(String, ForeignKey("styles.id", ondelete="CASCADE"), nullable=False)
    version_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    dataset_size = Column(Integer, nullable=True)
    benchmark_score = Column(Float, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    style = relationship("Style", back_populates="lora_versions")
