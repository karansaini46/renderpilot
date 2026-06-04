-- Migration: Add prompt_brain_analyses table
CREATE TABLE IF NOT EXISTS prompt_brain_analyses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_file_id TEXT REFERENCES project_files(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  scene_type TEXT,
  confidence DOUBLE PRECISION,
  analysis_json TEXT NOT NULL DEFAULT '{}',
  positive_prompt TEXT,
  negative_prompt TEXT,
  render_mode TEXT,
  denoise DOUBLE PRECISION,
  geometry_lock_mode TEXT,
  cache_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prompt_brain_analyses_project_id ON prompt_brain_analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_prompt_brain_analyses_project_file_id ON prompt_brain_analyses(project_file_id);
CREATE INDEX IF NOT EXISTS idx_prompt_brain_analyses_cache_key ON prompt_brain_analyses(cache_key);
CREATE INDEX IF NOT EXISTS idx_prompt_brain_analyses_created_at ON prompt_brain_analyses(created_at);
