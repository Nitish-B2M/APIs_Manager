-- Audit Logs Table: Tracks all changes in a collection
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "documentationId" UUID NOT NULL REFERENCES documentation (id) ON DELETE CASCADE,
    "userId" UUID REFERENCES users (id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'INVITE'
    "entityType" VARCHAR(50) NOT NULL, -- 'REQUEST', 'FOLDER', 'ENVIRONMENT', 'COLLECTION'
    "entityName" TEXT, -- e.g., "Login Request"
    changes JSONB, -- { "field": "url", "old": "...", "new": "..." }
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_doc_id ON audit_logs ("documentationId");
