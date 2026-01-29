-- ============================================
-- Migration: Add history column to requests table
-- Run this to fix: column "history" of relation "requests" does not exist
-- ============================================

-- Add history column if it doesn't exist
ALTER TABLE requests ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb;

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'requests' AND column_name = 'history';

-- If successful, you should see:
-- column_name | data_type |          column_default
-- -------------+-----------+------------------------------------
-- history     | jsonb     | '[]'::jsonb
