-- Add profile fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;