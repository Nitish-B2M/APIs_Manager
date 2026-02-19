-- Migration: Add folders support for organizing requests
-- Version: 001
-- Description: Creates folders table and adds folderId to requests

-- Create folders table
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "documentationId" UUID NOT NULL REFERENCES documentation(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    "parentId" UUID REFERENCES folders(id) ON DELETE CASCADE,
    "order" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add folderId column to requests table
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "folderId" UUID REFERENCES folders(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_folders_documentation ON folders("documentationId");
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders("parentId");
CREATE INDEX IF NOT EXISTS idx_requests_folder ON requests("folderId");

-- Add trigger to update updatedAt on folders
CREATE OR REPLACE FUNCTION update_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_folders_updated_at ON folders;
CREATE TRIGGER trigger_folders_updated_at
    BEFORE UPDATE ON folders
    FOR EACH ROW
    EXECUTE FUNCTION update_folders_updated_at();
