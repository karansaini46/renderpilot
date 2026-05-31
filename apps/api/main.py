import os
import json
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional

import models
import schemas
import repository
from database import engine, get_db

# Initialize database schemas and seed initial data using SQL scripts
def run_migrations_and_seeding():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    schema_path = os.path.join(current_dir, "migrations", "schema.sql")
    seed_path = os.path.join(current_dir, "migrations", "seed.sql")

    # Connect to local SQLite database using SQLAlchemy engine connection pool
    with engine.begin() as conn:
        # Run schema migration script
        if os.path.exists(schema_path):
            print(f"[Database] Executing schema migrations from: {schema_path}")
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_sql = f.read()
                raw_conn = conn.connection
                cursor = raw_conn.cursor()
                cursor.executescript(schema_sql)
                cursor.close()
        
        # Run seeding script for initial styles
        if os.path.exists(seed_path):
            print(f"[Database] Seeding initial styles from: {seed_path}")
            with open(seed_path, "r", encoding="utf-8") as f:
                seed_sql = f.read()
                raw_conn = conn.connection
                cursor = raw_conn.cursor()
                cursor.executescript(seed_sql)
                cursor.close()

# Run database setup at file load time to guarantee database preparation
run_migrations_and_seeding()

app = FastAPI(
    title="RenderPilot Core API",
    description="Backend orchestration service for RenderPilot architectural renders, running locally.",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
        comfyui_configured=True,
        comfyui_url=comfy_url,
        vram_profile="4GB RTX 3050 Optimized Profile (SD 1.5 default)",
        max_batch_size=1,
        max_controlnets=1
    )


# --- PROJECT ENDPOINTS ---

@app.post("/projects", response_model=schemas.ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    db_project = repository.get_project(db, project.id)
    if db_project:
        raise HTTPException(
            status_code=400,
            detail="Project with this ID already exists."
        )
    return repository.create_project(
        db=db,
        project_id=project.id,
        name=project.name,
        project_type=project.project_type,
        input_type=project.input_type,
        status=project.status
    )


@app.get("/projects", response_model=List[schemas.ProjectResponse])
def read_projects(db: Session = Depends(get_db)):
    return repository.get_projects(db)


@app.get("/projects/{project_id}", response_model=schemas.ProjectResponse)
def read_project(project_id: str, db: Session = Depends(get_db)):
    project = repository.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@app.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    success = repository.delete_project(db, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found.")
    return None


# --- STYLE ENDPOINTS ---

@app.get("/styles", response_model=List[schemas.StyleResponse])
def read_styles(db: Session = Depends(get_db)):
    return repository.get_styles(db)


# --- RENDER JOB ENDPOINTS ---

@app.post("/render", response_model=schemas.RenderJobResponse, status_code=status.HTTP_201_CREATED)
def create_render_job(job: schemas.RenderJobCreate, db: Session = Depends(get_db)):
    project = repository.get_project(db, job.project_id)
    if not project:
        raise HTTPException(
            status_code=404, 
            detail=f"Cannot associate render job. Project with ID '{job.project_id}' not found."
        )
    
    # Store settings dictionary directly via custom setter
    return repository.create_render_job(
        db=db,
        job_id=job.id,
        project_id=job.project_id,
        job_type=job.job_type,
        settings_json=json.dumps(job.settings) if job.settings else "{}"
    )


@app.get("/render/{job_id}", response_model=schemas.RenderJobResponse)
def read_render_job(job_id: str, db: Session = Depends(get_db)):
    job = repository.get_render_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found.")
    return job


@app.get("/render/project/{project_id}", response_model=List[schemas.RenderJobResponse])
def read_project_render_jobs(project_id: str, db: Session = Depends(get_db)):
    return repository.get_project_jobs(db, project_id)


# Callback route for local workers to update job progress status
@app.post("/render/{job_id}/update", response_model=schemas.RenderJobResponse)
def update_render_job(
    job_id: str, 
    status: str, 
    progress: int = 0,
    error_message: Optional[str] = None, 
    db: Session = Depends(get_db)
):
    job = repository.update_render_job(
        db=db,
        job_id=job_id,
        status=status,
        progress=progress,
        error_message=error_message
    )
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found.")
    return job
