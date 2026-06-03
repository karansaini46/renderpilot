-- PostgreSQL Schema Initialization for RenderPilot
-- Neon PostgreSQL Cloud Brain Engine

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'active', -- active, archived
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Project Files Table
CREATE TABLE IF NOT EXISTS project_files (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL, -- Bucket storage url paths only, never binaries
    file_type VARCHAR(100) NOT NULL, -- e.g. blend, reference_image, depth_pass
    metadata_json TEXT DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Workers Table
CREATE TABLE IF NOT EXISTS workers (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'offline', -- online, offline, busy
    ip_address VARCHAR(100),
    hostname VARCHAR(255),
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    settings_json TEXT DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Render Jobs Table
CREATE TABLE IF NOT EXISTS render_jobs (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    worker_id VARCHAR(255) REFERENCES workers(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued', -- queued, claimed, processing, completed, failed, cancelled, needs_review
    progress INTEGER DEFAULT 0,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    failed_at TIMESTAMP WITH TIME ZONE,
    settings_json TEXT DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 6. Styles Table
CREATE TABLE IF NOT EXISTS styles (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    prompt_template TEXT NOT NULL,
    negative_prompt TEXT,
    settings_json TEXT DEFAULT '{}',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Renders Table
CREATE TABLE IF NOT EXISTS renders (
    id VARCHAR(255) PRIMARY KEY,
    job_id VARCHAR(255) REFERENCES render_jobs(id) ON DELETE SET NULL,
    project_id VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    base_image_url TEXT, -- Bucket storage url paths only
    final_image_url TEXT NOT NULL, -- Bucket storage url paths only
    depth_url TEXT,
    canny_url TEXT,
    normal_url TEXT,
    style_id VARCHAR(255) REFERENCES styles(id) ON DELETE SET NULL,
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    seed BIGINT,
    settings_json TEXT DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Render Feedback Table
CREATE TABLE IF NOT EXISTS render_feedback (
    id VARCHAR(255) PRIMARY KEY,
    render_id VARCHAR(255) NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
    approved BOOLEAN DEFAULT FALSE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    scores_json TEXT DEFAULT '{}', -- stores geometry_score, realism_score, etc.
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Material Mappings Table
CREATE TABLE IF NOT EXISTS material_mappings (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    object_name VARCHAR(255) NOT NULL,
    detected_class VARCHAR(255) NOT NULL,
    selected_material VARCHAR(255) NOT NULL,
    confidence REAL NOT NULL,
    locked BOOLEAN DEFAULT FALSE,
    correction_source VARCHAR(100), -- user, heuristic
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Preference Memory Table
CREATE TABLE IF NOT EXISTS preference_memory (
    id VARCHAR(255) PRIMARY KEY,
    scope VARCHAR(100) NOT NULL, -- e.g. project, global
    key VARCHAR(255) NOT NULL,
    value_json TEXT NOT NULL, -- stores winning settings and configs
    score REAL DEFAULT 0.0, -- average score calculation
    source_render_id VARCHAR(255) REFERENCES renders(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Training Samples Table
CREATE TABLE IF NOT EXISTS training_samples (
    id VARCHAR(255) PRIMARY KEY,
    render_id VARCHAR(255) NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
    style_id VARCHAR(255) NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL, -- Bucket storage url path to candidate image only
    caption TEXT,
    quality_score REAL,
    approved_for_training BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Job Events Table
CREATE TABLE IF NOT EXISTS job_events (
    id VARCHAR(255) PRIMARY KEY,
    job_id VARCHAR(255) NOT NULL REFERENCES render_jobs(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- e.g. info, warning, error, step_start
    message TEXT NOT NULL,
    details_json TEXT DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. LoRA Versions Table
CREATE TABLE IF NOT EXISTS lora_versions (
    id VARCHAR(255) PRIMARY KEY,
    style_id VARCHAR(255) NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
    version_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL, -- Bucket storage url path to weights only
    dataset_size INTEGER,
    benchmark_score REAL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Benchmarks Table
CREATE TABLE IF NOT EXISTS benchmarks (
    id VARCHAR(255) PRIMARY KEY,
    worker_id VARCHAR(255) NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    score_name VARCHAR(255) NOT NULL,
    score_value REAL NOT NULL,
    test_duration_seconds REAL,
    details_json TEXT DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- INDEXES CONFIGURATION
-- Job status and worker status B-Tree indexes
CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs(status);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);

-- Project ID indexes across all tables to optimize workspace filters
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_project_id ON render_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_renders_project_id ON renders(project_id);
CREATE INDEX IF NOT EXISTS idx_material_mappings_project_id ON material_mappings(project_id);

-- Created at timestamp indexes for chronological filtering and tracking
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
CREATE INDEX IF NOT EXISTS idx_project_files_created_at ON project_files(created_at);
CREATE INDEX IF NOT EXISTS idx_workers_created_at ON workers(created_at);
CREATE INDEX IF NOT EXISTS idx_render_jobs_created_at ON render_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_renders_created_at ON renders(created_at);
CREATE INDEX IF NOT EXISTS idx_render_feedback_created_at ON render_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_material_mappings_created_at ON material_mappings(created_at);
CREATE INDEX IF NOT EXISTS idx_preference_memory_created_at ON preference_memory(created_at);
CREATE INDEX IF NOT EXISTS idx_training_samples_created_at ON training_samples(created_at);
CREATE INDEX IF NOT EXISTS idx_job_events_created_at ON job_events(created_at);
CREATE INDEX IF NOT EXISTS idx_lora_versions_created_at ON lora_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_benchmarks_created_at ON benchmarks(created_at);
