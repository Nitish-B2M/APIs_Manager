-- Migration 031: GitHub Accounts (stored in DB with encrypted tokens)
CREATE TABLE IF NOT EXISTS github_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "githubId" BIGINT NOT NULL,
    login VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    "avatarUrl" TEXT,
    "encryptedToken" TEXT NOT NULL,
    "isActive" BOOLEAN DEFAULT false,
    "addedAt" TIMESTAMPTZ DEFAULT NOW(),
    "lastUsed" TIMESTAMPTZ DEFAULT NOW()
);

-- One GitHub account per user per GitHub user
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_accounts_user_github
    ON github_accounts ("userId", "githubId");

-- Fast lookup for active account per user
CREATE INDEX IF NOT EXISTS idx_github_accounts_user_active
    ON github_accounts ("userId", "isActive");
