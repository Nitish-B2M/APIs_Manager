-- Migration 039: V3.0 — Application-wide Notification System

-- Drop and recreate notifications table with proper structure
DROP TABLE IF EXISTS notifications CASCADE;

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(30) NOT NULL,
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(10) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'critical')),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    link TEXT,
    metadata JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications ("userId", read, "createdAt" DESC);
CREATE INDEX idx_notifications_code ON notifications (code);

-- Notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(30) NOT NULL,
    in_app BOOLEAN DEFAULT true,
    email BOOLEAN DEFAULT false,
    UNIQUE("userId", code)
);

CREATE INDEX idx_notification_prefs_user ON notification_preferences ("userId");
