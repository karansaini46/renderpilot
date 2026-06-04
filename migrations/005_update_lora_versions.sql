-- Migration: Update lora_versions table with new tracking fields
ALTER TABLE lora_versions ADD COLUMN IF NOT EXISTS version VARCHAR(100) DEFAULT '1.0.0';
ALTER TABLE lora_versions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ready';
ALTER TABLE lora_versions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE lora_versions ALTER COLUMN active SET DEFAULT FALSE;
