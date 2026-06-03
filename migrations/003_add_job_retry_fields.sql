-- Migration: Add job retry and failure tracking columns to render_jobs
-- Neon PostgreSQL Cloud datastore

ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP WITH TIME ZONE;
