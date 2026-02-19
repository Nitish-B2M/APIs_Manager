-- Environments table for storing multiple environment variable sets
CREATE TABLE IF NOT EXISTS environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "documentationId" UUID NOT NULL REFERENCES documentation(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    variables JSONB DEFAULT '{}'::jsonb,
    "isActive" BOOLEAN DEFAULT false,
    "order" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_environments_documentation ON environments("documentationId");

-- Ensure only one active environment per documentation
CREATE UNIQUE INDEX IF NOT EXISTS idx_environments_active 
    ON environments("documentationId") 
    WHERE "isActive" = true;
