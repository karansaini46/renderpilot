from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import models

# --- PROJECT REPOSITORY ---
def get_project(db: Session, project_id: str) -> Optional[models.Project]:
    return db.query(models.Project).filter(models.Project.id == project_id).first()

def get_projects(db: Session) -> List[models.Project]:
    return db.query(models.Project).order_by(models.Project.updated_at.desc()).all()

def create_project(db: Session, project_id: str, name: str, project_type: str, input_type: str, status: str) -> models.Project:
    db_project = models.Project(
        id=project_id,
        name=name,
        project_type=project_type,
        input_type=input_type,
        status=status
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

def delete_project(db: Session, project_id: str) -> bool:
    db_project = get_project(db, project_id)
    if db_project:
        db.delete(db_project)
        db.commit()
        return True
    return False


# --- ASSET REPOSITORY ---
def get_asset(db: Session, asset_id: str) -> Optional[models.Asset]:
    return db.query(models.Asset).filter(models.Asset.id == asset_id).first()

def get_project_assets(db: Session, project_id: str) -> List[models.Asset]:
    return db.query(models.Asset).filter(models.Asset.project_id == project_id).all()

def create_asset(db: Session, asset_id: str, project_id: str, file_path: str, asset_type: str, metadata_json: str = "{}") -> models.Asset:
    db_asset = models.Asset(
        id=asset_id,
        project_id=project_id,
        file_path=file_path,
        asset_type=asset_type,
        metadata_json=metadata_json
    )
    db.add(db_asset)
    db.commit()
    db.refresh(db_asset)
    return db_asset


# --- MATERIAL REPOSITORY ---
def get_material(db: Session, material_id: str) -> Optional[models.Material]:
    return db.query(models.Material).filter(models.Material.id == material_id).first()

def get_project_materials(db: Session, project_id: str) -> List[models.Material]:
    return db.query(models.Material).filter(models.Material.project_id == project_id).all()

def create_material(db: Session, material_id: str, project_id: str, object_name: str, detected_class: str, selected_material: str, confidence: float) -> models.Material:
    db_material = models.Material(
        id=material_id,
        project_id=project_id,
        object_name=object_name,
        detected_class=detected_class,
        selected_material=selected_material,
        confidence=confidence
    )
    db.add(db_material)
    db.commit()
    db.refresh(db_material)
    return db_material

def update_material(db: Session, material_id: str, selected_material: str, locked: bool, correction_source: str) -> Optional[models.Material]:
    db_material = get_material(db, material_id)
    if db_material:
        db_material.selected_material = selected_material
        db_material.locked = locked
        db_material.correction_source = correction_source
        db.commit()
        db.refresh(db_material)
        return db_material
    return None


# --- STYLE REPOSITORY ---
def get_style(db: Session, style_id: str) -> Optional[models.Style]:
    return db.query(models.Style).filter(models.Style.id == style_id).first()

def get_styles(db: Session) -> List[models.Style]:
    return db.query(models.Style).filter(models.Style.active == True).all()

def create_style(db: Session, style_id: str, name: str, prompt_template: str, negative_prompt: Optional[str] = None, settings_json: str = "{}") -> models.Style:
    db_style = models.Style(
        id=style_id,
        name=name,
        prompt_template=prompt_template,
        negative_prompt=negative_prompt,
        settings_json=settings_json
    )
    db.add(db_style)
    db.commit()
    db.refresh(db_style)
    return db_style


# --- RENDER JOB REPOSITORY ---
def get_render_job(db: Session, job_id: str) -> Optional[models.RenderJob]:
    return db.query(models.RenderJob).filter(models.RenderJob.id == job_id).first()

def get_project_jobs(db: Session, project_id: str) -> List[models.RenderJob]:
    return db.query(models.RenderJob).filter(models.RenderJob.project_id == project_id).order_by(models.RenderJob.created_at.desc()).all()

def create_render_job(db: Session, job_id: str, project_id: str, job_type: str, settings_json: str = "{}") -> models.RenderJob:
    db_job = models.RenderJob(
        id=job_id,
        project_id=project_id,
        job_type=job_type,
        status="PENDING",
        settings_json=settings_json
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job

def update_render_job(db: Session, job_id: str, status: str, progress: int = 0, error_message: Optional[str] = None) -> Optional[models.RenderJob]:
    import datetime
    db_job = get_render_job(db, job_id)
    if db_job:
        db_job.status = status
        db_job.progress = progress
        if error_message:
            db_job.error_message = error_message
        if status in ["COMPLETED", "FAILED"]:
            db_job.completed_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(db_job)
        return db_job
    return None


# --- RENDERS REPOSITORY ---
def get_render(db: Session, render_id: str) -> Optional[models.Render]:
    return db.query(models.Render).filter(models.Render.id == render_id).first()

def get_project_renders(db: Session, project_id: str) -> List[models.Render]:
    return db.query(models.Render).filter(models.Render.project_id == project_id).order_by(models.Render.created_at.desc()).all()

def create_render(db: Session, render_id: str, project_id: str, final_image_path: str, prompt: str, style_id: Optional[str] = None, base_image_path: Optional[str] = None, depth_path: Optional[str] = None, canny_path: Optional[str] = None, normal_path: Optional[str] = None, negative_prompt: Optional[str] = None, seed: Optional[int] = None, settings_json: str = "{}") -> models.Render:
    db_render = models.Render(
        id=render_id,
        project_id=project_id,
        final_image_path=final_image_path,
        prompt=prompt,
        style_id=style_id,
        base_image_path=base_image_path,
        depth_path=depth_path,
        canny_path=canny_path,
        normal_path=normal_path,
        negative_prompt=negative_prompt,
        seed=seed,
        settings_json=settings_json
    )
    db.add(db_render)
    db.commit()
    db.refresh(db_render)
    return db_render


# --- FEEDBACK REPOSITORY ---
def create_feedback(db: Session, feedback_id: str, render_id: str, approved: bool, rating: Optional[int] = None, geometry_score: Optional[int] = None, lighting_score: Optional[int] = None, material_score: Optional[int] = None, realism_score: Optional[int] = None, rejection_reason: Optional[str] = None, notes: Optional[str] = None) -> models.Feedback:
    db_feedback = models.Feedback(
        id=feedback_id,
        render_id=render_id,
        approved=approved,
        rating=rating,
        geometry_score=geometry_score,
        lighting_score=lighting_score,
        material_score=material_score,
        realism_score=realism_score,
        rejection_reason=rejection_reason,
        notes=notes
    )
    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)
    return db_feedback

def get_render_feedback(db: Session, render_id: str) -> Optional[models.Feedback]:
    return db.query(models.Feedback).filter(models.Feedback.render_id == render_id).first()


# --- MEMORY RULES REPOSITORY ---
def get_memory_rules(db: Session) -> List[models.MemoryRule]:
    return db.query(models.MemoryRule).order_by(models.MemoryRule.score.desc()).all()

def create_memory_rule(db: Session, rule_id: str, scope: str, key: str, value_json: str, score: float = 0.0, source_render_id: Optional[str] = None) -> models.MemoryRule:
    db_rule = models.MemoryRule(
        id=rule_id,
        scope=scope,
        key=key,
        value_json=value_json,
        score=score,
        source_render_id=source_render_id
    )
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return db_rule


# --- TRAINING SAMPLES REPOSITORY ---
def get_approved_samples(db: Session) -> List[models.TrainingSample]:
    return db.query(models.TrainingSample).filter(models.TrainingSample.approved_for_training == True).all()

def create_training_sample(db: Session, sample_id: str, render_id: str, style_id: str, image_path: str, caption: Optional[str] = None, quality_score: Optional[float] = None, approved_for_training: bool = False) -> models.TrainingSample:
    db_sample = models.TrainingSample(
        id=sample_id,
        render_id=render_id,
        style_id=style_id,
        image_path=image_path,
        caption=caption,
        quality_score=quality_score,
        approved_for_training=approved_for_training
    )
    db.add(db_sample)
    db.commit()
    db.refresh(db_sample)
    return db_sample


# --- LORA VERSION REPOSITORY ---
def get_active_loras_for_style(db: Session, style_id: str) -> List[models.LoraVersion]:
    return db.query(models.LoraVersion).filter(models.LoraVersion.style_id == style_id, models.LoraVersion.active == True).all()

def create_lora_version(db: Session, lora_id: str, style_id: str, version_name: str, file_path: str, dataset_size: Optional[int] = None, benchmark_score: Optional[float] = None, active: bool = True) -> models.LoraVersion:
    db_lora = models.LoraVersion(
        id=lora_id,
        style_id=style_id,
        version_name=version_name,
        file_path=file_path,
        dataset_size=dataset_size,
        benchmark_score=benchmark_score,
        active=active
    )
    db.add(db_lora)
    db.commit()
    db.refresh(db_lora)
    return db_lora
