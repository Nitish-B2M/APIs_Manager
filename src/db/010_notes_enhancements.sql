-- Add is_pinned column to notes table
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;