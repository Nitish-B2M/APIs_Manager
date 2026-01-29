-- migration.sql
BEGIN;

-- 1. Create the requests table if it doesn't exist
CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "documentationId" UUID NOT NULL REFERENCES documentation (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    body JSONB,
    headers JSONB,
    params JSONB,
    "lastResponse" JSONB,
    "order" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Migrate existing endpoints safely
-- Use a subquery with a regex filter to ensure we only touch valid JSON objects
-- and handle errors gracefully within the transaction
INSERT INTO
    requests (
        "documentationId",
        name,
        method,
        url,
        description,
        body,
        headers,
        params,
        "lastResponse",
        "order"
    )
SELECT
    doc_id,
    COALESCE(
        ep ->> 'name',
        'Untitled Request'
    ),
    COALESCE(ep ->> 'method', 'GET'),
    COALESCE(ep ->> 'url', ''),
    ep ->> 'description',
    COALESCE(ep -> 'body', '{}'::jsonb),
    COALESCE(ep -> 'headers', '[]'::jsonb),
    COALESCE(ep -> 'params', '[]'::jsonb),
    ep -> 'lastResponse',
    idx - 1
FROM (
        SELECT id as doc_id, content::jsonb as c
        FROM documentation
        WHERE
            content IS NOT NULL
            AND content ~ '^\s*\{.*\}\s*$' -- Only cast if it looks like a JSON object
    ) as valid_docs, jsonb_array_elements(c -> 'endpoints')
WITH
    ORDINALITY AS t (ep, idx)
WHERE
    c ? 'endpoints';

-- 3. Clean up the documentation.content field for migrated records
UPDATE documentation
SET
    content = (content::jsonb - 'endpoints')::text
WHERE
    content IS NOT NULL
    AND content ~ '^\s*\{.*\}\s*$'
    AND content::jsonb ? 'endpoints';

COMMIT;
-- If any error occurs before COMMIT, simply run ROLLBACK; manually or the database will discard the changes if run as a single block.