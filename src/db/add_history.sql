-- Add history column to requests table
ALTER TABLE requests ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb;
