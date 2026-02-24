-- Add scope, userId, and secrets columns to environments table
-- 1. Make documentationId nullable for GLOBAL scope
ALTER TABLE environments
ALTER COLUMN "documentationId"
DROP NOT NULL;

-- 2. Add userId for GLOBAL environments (so each user has their own globals)
ALTER TABLE environments
ADD COLUMN "userId" UUID REFERENCES users (id) ON DELETE CASCADE;

-- 3. Add scope column
ALTER TABLE environments
ADD COLUMN "scope" TEXT DEFAULT 'COLLECTION' CHECK (
    scope IN ('COLLECTION', 'GLOBAL')
);

-- 4. Add secrets column to store which variable keys are masked
ALTER TABLE environments
ADD COLUMN "secrets" JSONB DEFAULT '[]'::jsonb;

-- 5. Update unique index to handle NULL documentationId for GLOBAL scope
-- The existing unique index idx_environments_active is on documentationId where isActive = true.
-- For GLOBAL, we need a separate active environment per user.

DROP INDEX IF EXISTS idx_environments_active;

-- Active COLLECTION environment per documentation
CREATE UNIQUE INDEX idx_environments_active_collection ON environments ("documentationId")
WHERE
    "isActive" = true
    AND "scope" = 'COLLECTION';

-- Active GLOBAL environment per user
CREATE UNIQUE INDEX idx_environments_active_global ON environments ("userId")
WHERE
    "isActive" = true
    AND "scope" = 'GLOBAL';

-- 6. Backfill userId for existing records (from documentation table)
UPDATE environments e
SET
    "userId" = d."userId"
FROM documentation d
WHERE
    e."documentationId" = d.id;

-- 7. Ensure userId is NOT NULL for future records (global or local)
-- (Maybe not strictly necessary but good for security)
-- ALTER TABLE environments ALTER COLUMN "userId" SET NOT NULL;