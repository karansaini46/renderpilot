import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
import datetime

import models
import schemas
from database import engine, get_db

# Automatically initialize SQLite database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="RenderPilot Core API",
    description="Backend orchestration service for RenderPilot architectural renders, running locally.",
    version="1.0.0"
)

# Set up local cross-origin request permissions
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to localhost in production but allow all in local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {
        "app": "RenderPilot API",
        "version": "1.0.0",
        "documentation": "/docs",
        "status": "online"
    }


@app.get("/status", response_model=schemas.SystemStatusResponse)
def get_system_status():
    blender_path = os.getenv("BLENDER_EXE_PATH", "")
    blender_configured = os.path.exists(blender_path) if blender_path else False
    
    comfy_url = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188")
    
    return schemas.SystemStatusResponse(
        api_status="online",
        blender_configured=blender_configured,
        blender_path=blender_path,
        comfyui_configured=True,  # Assumed true for worker integration
        comfyui_url=comfy_url,
        vram_profile="4GB RTX 3050 Optimized Profile (SD 1.5 default)",
        max_batch_size=1,
        max_controlnets=1
    )


# --- PROJECT ENDPOINTS ---

@app.post("/projects", response_model=schemas.ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project.id).first()
    if db_project:
        raise HTTPException(
            status_code=400,
            detail="Project with this ID already exists."
        )
    
    new_project = models.Project(
        id=project.id,
        name=project.name,
        source_file=project.source_file
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project


@app.get("/projects", response_model=List[schemas.ProjectResponse])
def read_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).order_by(models.Project.updated_at.desc()).all()


@app.get("/projects/{project_id}", response_model=schemas.ProjectResponse)
def read_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@app.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    db.delete(project)
    db.commit()
    return None


# --- RENDER JOB ENDPOINTS ---

@app.post("/render", response_model=schemas.RenderJobResponse, status_code=status.HTTP_201_CREATED)
def create_render_job(job: schemas.RenderJobCreate, db: Session = Depends(get_db)):
    # Verify the project exists first
    project = db.query(models.Project).filter(models.Project.id == job.project_id).first()
    if not project:
        raise HTTPException(
            status_code=404, 
            detail=f"Cannot associate render job. Project with ID '{job.project_id}' not found."
        )

    # Hardware verification failsafe (redundant check alongside schemas)
    if job.batch_size != 1 or job.controlnet_layers > 1:
        raise HTTPException(
            status_code=400,
            detail="Hardware parameters exceed 4GB VRAM safety threshold (max batch size: 1, max controlnets: 1)."
        )

    new_job = models.RenderJob(
        id=job.id,
        project_id=job.project_id,
        preset_name=job.preset_name,
        prompt=job.prompt,
        negative_prompt=job.negative_prompt,
        batch_size=job.batch_size,
        controlnet_layers=job.controlnet_layers,
        status="PENDING"
    )
    db.add(new_job)
    
    # Touch the project's updated_at timestamp
    project.updated_at = datetime.datetime.utcnow()
    
    db.commit()
    db.refresh(new_job)
    return new_job


@app.get("/render/{job_id}", response_model=schemas.RenderJobResponse)
def read_render_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.RenderJob).filter(models.RenderJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found.")
    return job


@app.get("/render/project/{project_id}", response_model=List[schemas.RenderJobResponse])
def read_project_render_jobs(project_id: str, db: Session = Depends(get_db)):
    return db.query(models.RenderJob).filter(models.RenderJob.project_id == project_id).order_by(models.RenderJob.created_at.desc()).all()


# Callback API endpoint used by local workers to update orchestration states
@app.post("/render/{job_id}/update", response_model=schemas.RenderJobResponse)
def update_render_job(
    job_id: str, 
    status: str, 
    output_image_path: Optional[str] = None, 
    error_message: Optional[str] = None, 
    db: Session = Depends(get_db)
):
    job = db.query(models.RenderJob).filter(models.RenderJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found.")
    
    job.status = status
    if output_image_path:
        job.output_image_path = output_image_path
    if error_message:
        job.error_message = error_message
    
    if status in ["COMPLETED", "FAILED"]:
        job.completed_at = datetime.datetime.utcnow()
        
    db.commit()
    db.refresh(job)
    return job
