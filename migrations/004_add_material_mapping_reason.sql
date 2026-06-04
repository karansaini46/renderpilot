-- Migration: Add reason column to material_mappings table
ALTER TABLE material_mappings ADD COLUMN IF NOT EXISTS reason TEXT;
