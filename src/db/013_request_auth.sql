-- Add auth column to requests table for per-request auth configuration
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS auth JSONB DEFAULT '{"type":"none"}'::jsonb;