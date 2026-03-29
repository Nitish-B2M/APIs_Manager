-- Migration 038: Performance indexes for all critical queries

-- Documentation access patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documentation_user ON documentation ("userId", "updatedAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documentation_public ON documentation ("isPublic") WHERE "isPublic" = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documentation_slug ON documentation (slug) WHERE slug IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documentation_workspace ON documentation ("workspaceId") WHERE "workspaceId" IS NOT NULL;

-- Collaborators (JOIN-heavy table)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_collab_doc_user ON documentation_collaborators ("documentationId", "userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_collab_user ON documentation_collaborators ("userId");

-- Requests (most queried table)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requests_doc_order ON requests ("documentationId", "order");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requests_folder ON requests ("folderId") WHERE "folderId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requests_doc ON requests ("documentationId");

-- Folders
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_doc ON folders ("documentationId", "order");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_folders_parent ON folders ("parentId") WHERE "parentId" IS NOT NULL;

-- Environments
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_environments_doc ON environments ("documentationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_environments_user_scope ON environments ("userId", scope);

-- Todos (frequently filtered)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_todos_user_deleted ON todos ("userId", "deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_todos_user_date ON todos ("userId", date DESC) WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_todos_reference ON todos ("referenceId", "referenceType") WHERE "referenceId" IS NOT NULL;

-- Notes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notes_user_deleted ON notes ("userId") WHERE is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notes_pinned ON notes ("userId", is_pinned DESC, "updatedAt" DESC) WHERE is_deleted = false;

-- Monitor results
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_monitor_results_monitor ON monitor_results ("monitorId", "createdAt" DESC);

-- Audit logs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_doc ON audit_logs ("documentationId", "createdAt" DESC);

-- Refresh tokens (security)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_cleanup ON refresh_tokens ("expiresAt") WHERE revoked = false;

-- Invitations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invitations_email ON invitations (email, "expiresAt") WHERE "expiresAt" > NOW();

-- Snapshots
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_snapshots_doc ON snapshots ("documentationId", "createdAt" DESC);
