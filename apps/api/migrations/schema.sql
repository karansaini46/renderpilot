-- SQLite Schema Blueprint for RenderPilot

-- Enable foreign key constraint enforcement
PRAGMA foreign_keys = ON;

-- 1. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_type TEXT NOT NULL,
    input_type TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Assets Table
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    metadata_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- 3. Materials Table
CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    object_name TEXT NOT NULL,
    detected_class TEXT NOT NULL,
    selected_material TEXT NOT NULL,
    confidence REAL NOT NULL,
    locked INTEGER DEFAULT 0, -- Boolean mapping
    correction_source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- 4. Styles Table
CREATE TABLE IF NOT EXISTS styles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    prompt_template TEXT NOT NULL,
    negative_prompt TEXT,
    settings_json TEXT DEFAULT '{}',
    active INTEGER DEFAULT 1
);

-- 5. Render Jobs Table
CREATE TABLE IF NOT EXISTS render_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    error_message TEXT,
    settings_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- 6. Renders Table
CREATE TABLE IF NOT EXISTS renders (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    base_image_path TEXT,
    final_image_path TEXT NOT NULL,
    depth_path TEXT,
    canny_path TEXT,
    normal_path TEXT,
    style_id TEXT,
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    seed INTEGER,
    settings_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    FOREIGN KEY (style_id) REFERENCES styles (id) ON DELETE SET NULL
);

-- 7. Feedback Table
CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    render_id TEXT NOT NULL,
    approved INTEGER DEFAULT 0,
    rating INTEGER,
    geometry_score INTEGER,
    lighting_score INTEGER,
    material_score INTEGER,
    realism_score INTEGER,
    rejection_reason TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (render_id) REFERENCES renders (id) ON DELETE CASCADE
);

-- 8. Memory Rules Table
CREATE TABLE IF NOT EXISTS memory_rules (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    score REAL DEFAULT 0.0,
    source_render_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_render_id) REFERENCES renders (id) ON DELETE SET NULL
);

-- 9. Training Samples Table
CREATE TABLE IF NOT EXISTS training_samples (
    id TEXT PRIMARY KEY,
    render_id TEXT NOT NULL,
    style_id TEXT NOT NULL,
    image_path TEXT NOT NULL,
    caption TEXT,
    quality_score REAL,
    approved_for_training INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (render_id) REFERENCES renders (id) ON DELETE CASCADE,
    FOREIGN KEY (style_id) REFERENCES styles (id) ON DELETE CASCADE
);

-- 10. LoRA Versions Table
CREATE TABLE IF NOT EXISTS lora_versions (
    id TEXT PRIMARY KEY,
    style_id TEXT NOT NULL,
    version_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    dataset_size INTEGER,
    benchmark_score REAL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (style_id) REFERENCES styles (id) ON DELETE CASCADE
);
