-- Workspace Integration: Link Notes and Todos to API endpoints/folders
ALTER TABLE notes ADD COLUMN IF NOT EXISTS "referenceId" UUID;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS "referenceType" TEXT;

ALTER TABLE todos ADD COLUMN IF NOT EXISTS "referenceId" UUID;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS "referenceType" TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_reference ON notes("referenceId", "referenceType");
CREATE INDEX IF NOT EXISTS idx_todos_reference ON todos("referenceId", "referenceType");
