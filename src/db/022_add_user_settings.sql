-- Add settings JSONB column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;