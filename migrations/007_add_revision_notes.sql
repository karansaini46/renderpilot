-- Migration: Add clientName to projects and create revision_notes table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name TEXT;

CREATE TABLE IF NOT EXISTS revision_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_name TEXT,
  reason TEXT,
  requested_change TEXT NOT NULL,
  style TEXT,
  settings_json TEXT DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_revision_notes_project_id ON revision_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_revision_notes_created_at ON revision_notes(created_at);
