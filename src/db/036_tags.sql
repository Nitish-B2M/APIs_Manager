-- Migration 036: Tags & Labels System

CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#6366f1',
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_name ON tags ("userId", name);

CREATE TABLE IF NOT EXISTS entity_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tagId" UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    "entityId" UUID NOT NULL,
    "entityType" VARCHAR(20) NOT NULL CHECK ("entityType" IN ('request', 'collection', 'note')),
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_tags_unique ON entity_tags ("tagId", "entityId", "entityType");
CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags ("entityId", "entityType");
