-- Migration: Add deliveries and delivery_comments tables
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  password TEXT,
  comments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  renders_json TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_comments (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  render_id TEXT REFERENCES renders(id) ON DELETE SET NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deliveries_token ON deliveries(token);
CREATE INDEX IF NOT EXISTS idx_delivery_comments_delivery_id ON delivery_comments(delivery_id);
