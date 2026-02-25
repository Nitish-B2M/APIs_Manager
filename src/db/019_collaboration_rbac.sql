DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('VIEWER', 'EDITOR', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS documentation_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "documentationId" UUID NOT NULL REFERENCES documentation (id) ON DELETE CASCADE,
    "userId" UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("documentationId", "userId")
);

CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    email TEXT NOT NULL,
    "documentationId" UUID NOT NULL REFERENCES documentation (id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'VIEWER',
    token TEXT NOT NULL UNIQUE,
    "invitedBy" UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (email, "documentationId")
);