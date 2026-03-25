-- Add conditional rules to mock responses
ALTER TABLE mock_responses 
ADD COLUMN IF NOT EXISTS "rules" JSONB DEFAULT '[]'::jsonb;
