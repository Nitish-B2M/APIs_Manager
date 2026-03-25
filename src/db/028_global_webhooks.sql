-- Webhooks Table: Allows users to subscribe to workspace events
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "documentationId" UUID REFERENCES documentation (id) ON DELETE CASCADE, -- Optional: Global vs Documentation level
    "userId" UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    secret VARCHAR(255),
    events JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of event names like ['request.created', 'monitor.failure']
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook Delivery Logs
CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "webhookId" UUID NOT NULL REFERENCES webhooks (id) ON DELETE CASCADE,
    event VARCHAR(100) NOT NULL,
    "statusCode" INTEGER,
    response TEXT,
    "isSuccess" BOOLEAN NOT NULL,
    "deliveredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_doc_id ON webhooks ("documentationId");
