-- 017_collection_snapshots.sql

CREATE TABLE IF NOT EXISTS snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "documentationId" UUID NOT NULL REFERENCES documentation (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    data JSONB NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);