-- 016_add_request_assertions.sql

ALTER TABLE requests
ADD COLUMN IF NOT EXISTS assertions JSONB DEFAULT '[]'::jsonb;