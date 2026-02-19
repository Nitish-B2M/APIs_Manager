-- Add slug column to documentation table for public URLs
ALTER TABLE documentation ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_documentation_slug ON documentation (slug);