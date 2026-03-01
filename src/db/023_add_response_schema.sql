-- Add responseSchema column to requests table
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "responseSchema" JSONB;