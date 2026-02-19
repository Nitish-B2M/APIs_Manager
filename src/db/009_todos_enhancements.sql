-- Add priority and description columns to todos table
ALTER TABLE todos
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';

ALTER TABLE todos ADD COLUMN IF NOT EXISTS description TEXT;