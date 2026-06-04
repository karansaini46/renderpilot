-- Migration: Add specific benchmark score fields to lora_versions table
ALTER TABLE lora_versions ADD COLUMN IF NOT EXISTS geometry_score REAL;
ALTER TABLE lora_versions ADD COLUMN IF NOT EXISTS style_score REAL;
ALTER TABLE lora_versions ADD COLUMN IF NOT EXISTS realism_score REAL;
ALTER TABLE lora_versions ADD COLUMN IF NOT EXISTS material_score REAL;
ALTER TABLE lora_versions ADD COLUMN IF NOT EXISTS overall_score REAL;
ALTER TABLE lora_versions ADD COLUMN IF NOT EXISTS passed BOOLEAN DEFAULT FALSE;
