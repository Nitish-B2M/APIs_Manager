-- Monitors: configuration for scheduled API health checks
CREATE TABLE IF NOT EXISTS monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "documentationId" UUID NOT NULL REFERENCES documentation (id) ON DELETE CASCADE,
    "requestId" UUID REFERENCES requests (id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    method VARCHAR(20) NOT NULL DEFAULT 'GET',
    headers JSONB DEFAULT '[]',
    body TEXT,
    frequency VARCHAR(50) NOT NULL DEFAULT '5min',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmail" VARCHAR(255),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Monitor Results: historical log of each check execution
CREATE TABLE IF NOT EXISTS monitor_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "monitorId" UUID NOT NULL REFERENCES monitors (id) ON DELETE CASCADE,
    "statusCode" INTEGER,
    "responseTime" INTEGER, -- in milliseconds
    "isSuccess" BOOLEAN NOT NULL,
    error TEXT,
    "checkedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast history lookups
CREATE INDEX IF NOT EXISTS idx_monitor_results_monitor_id ON monitor_results ("monitorId");

CREATE INDEX IF NOT EXISTS idx_monitors_doc_id ON monitors ("documentationId");