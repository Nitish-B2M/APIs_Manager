-- Migration 040: V3.0 — Notification codes stored in DB (admin-manageable)

CREATE TABLE IF NOT EXISTS notification_codes (
    code VARCHAR(30) PRIMARY KEY,
    category VARCHAR(30) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(10) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'critical')),
    default_in_app BOOLEAN DEFAULT true,
    default_email BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default notification codes
INSERT INTO notification_codes (code, category, title, description, severity, default_in_app, default_email) VALUES
    -- User
    ('NOTIFY_USER_001', 'user', 'User registered', 'Welcome notification on signup', 'info', true, false),
    ('NOTIFY_USER_002', 'user', 'Email verified', 'Email verification confirmed', 'info', true, false),
    ('NOTIFY_USER_003', 'user', 'Password changed', 'Password was changed', 'warn', true, true),
    ('NOTIFY_USER_004', 'user', 'Account locked', 'Too many failed login attempts', 'critical', true, true),
    ('NOTIFY_USER_005', 'user', 'New login detected', 'Login from unknown IP/device', 'warn', true, true),
    -- Collaboration
    ('NOTIFY_COLLAB_001', 'collaboration', 'Invited to collection', 'You received a collaboration invite', 'info', true, true),
    ('NOTIFY_COLLAB_002', 'collaboration', 'Invite accepted', 'Your invite was accepted', 'info', true, false),
    ('NOTIFY_COLLAB_003', 'collaboration', 'Invite rejected', 'Your invite was declined', 'info', true, false),
    ('NOTIFY_COLLAB_004', 'collaboration', 'Removed from collection', 'You were removed from a collection', 'warn', true, true),
    ('NOTIFY_COLLAB_005', 'collaboration', 'Role changed', 'Your role was updated', 'info', true, false),
    -- Workspace
    ('NOTIFY_WORKSPACE_001', 'workspace', 'Added to workspace', 'You were added to a team workspace', 'info', true, true),
    ('NOTIFY_WORKSPACE_002', 'workspace', 'Removed from workspace', 'You were removed from a workspace', 'warn', true, true),
    ('NOTIFY_WORKSPACE_003', 'workspace', 'Workspace deleted', 'A workspace you belong to was deleted', 'critical', true, true),
    -- Documentation
    ('NOTIFY_DOC_001', 'documentation', 'Collection shared', 'A collection was shared with you', 'info', true, true),
    ('NOTIFY_DOC_002', 'documentation', 'Collection deleted', 'A collection was deleted', 'warn', true, false),
    ('NOTIFY_DOC_003', 'documentation', 'Snapshot restored', 'A snapshot was restored by another user', 'warn', true, false),
    ('NOTIFY_DOC_004', 'documentation', 'Edit conflict', 'Another user modified the same request', 'warn', true, false),
    -- Monitor
    ('NOTIFY_MONITOR_001', 'monitor', 'Endpoint down', 'A monitored endpoint is unreachable', 'critical', true, true),
    ('NOTIFY_MONITOR_002', 'monitor', 'Endpoint recovered', 'A monitored endpoint is back online', 'info', true, true),
    ('NOTIFY_MONITOR_003', 'monitor', 'Slow response', 'Response time exceeds threshold', 'warn', true, false),
    -- Webhook
    ('NOTIFY_WEBHOOK_001', 'webhook', 'Delivery failed', 'A webhook delivery attempt failed', 'warn', true, false),
    ('NOTIFY_WEBHOOK_002', 'webhook', 'Dead letter', 'All webhook retry attempts exhausted', 'critical', true, true),
    -- Comment
    ('NOTIFY_COMMENT_001', 'comment', 'Mentioned in comment', 'Someone mentioned you in a comment', 'info', true, true),
    ('NOTIFY_COMMENT_002', 'comment', 'Reply to comment', 'Someone replied to your comment', 'info', true, false),
    -- System
    ('NOTIFY_SYSTEM_001', 'system', 'Maintenance scheduled', 'Platform maintenance is scheduled', 'info', true, true),
    ('NOTIFY_SYSTEM_002', 'system', 'New feature available', 'A new feature has been released', 'info', true, false)
ON CONFLICT (code) DO NOTHING;
