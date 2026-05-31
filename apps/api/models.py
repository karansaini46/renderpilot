import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    source_file = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    jobs = relationship("RenderJob", back_populates="project", cascade="all, delete-orphan")


class RenderJob(Base):
    __tablename__ = "render_jobs"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, default="PENDING")  # PENDING, BLENDER_EXPORT, GENERATING, COMPLETED, FAILED
    preset_name = Column(String, nullable=False)
    prompt = Column(String, nullable=False)
    negative_prompt = Column(String, nullable=True)
    
    # Enforced hardware parameters
    batch_size = Column(Integer, default=1)
    controlnet_layers = Column(Integer, default=1)
    
    output_image_path = Column(String, nullable=True)
    error_message = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    project = relationship("Project", back_populates="jobs")
