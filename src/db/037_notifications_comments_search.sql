-- Migration 037: Notifications, Comments, Full-text Search

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    link TEXT,
    read BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications ("userId", read, "createdAt" DESC);

-- Request Comments
CREATE TABLE IF NOT EXISTS request_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "requestId" UUID NOT NULL,
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    "parentId" UUID REFERENCES request_comments(id) ON DELETE CASCADE,
    resolved BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_comments_request ON request_comments ("requestId", "createdAt" ASC);

-- Request Templates
CREATE TABLE IF NOT EXISTS request_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "workspaceId" UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    method VARCHAR(10) DEFAULT 'GET',
    url TEXT,
    headers JSONB DEFAULT '[]',
    body JSONB,
    description TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_templates_user ON request_templates ("userId");

-- Full-text search index on requests
CREATE INDEX IF NOT EXISTS idx_requests_search ON requests USING gin (to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(url, '') || ' ' || COALESCE(description, '')));

-- Full-text search index on documentation
CREATE INDEX IF NOT EXISTS idx_documentation_search ON documentation USING gin (to_tsvector('english', COALESCE(title, '')));

-- API versioning
ALTER TABLE documentation ADD COLUMN IF NOT EXISTS "apiVersion" VARCHAR(20) DEFAULT '1.0.0';
