-- Migration: Add protocol column to requests table
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS protocol TEXT DEFAULT 'REST';