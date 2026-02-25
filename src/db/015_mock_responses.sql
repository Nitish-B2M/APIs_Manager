CREATE TABLE IF NOT EXISTS mock_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "requestId" UUID NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
    "statusCode" INTEGER DEFAULT 200,
    headers JSONB DEFAULT '{}'::jsonb,
    body TEXT,
    delay INTEGER DEFAULT 0, -- delay in ms
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookup by requestId
CREATE INDEX IF NOT EXISTS idx_mock_responses_request_id ON mock_responses ("requestId");