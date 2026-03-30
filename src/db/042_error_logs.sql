-- ═══════════════════════════════════════════════════════════════════
-- Migration 042: Comprehensive Error Logging System
-- Persistent error_logs table for structured error tracking
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level VARCHAR(10) NOT NULL DEFAULT 'error',         -- error, warn, critical
    service VARCHAR(100) NOT NULL,                       -- AuthService, DocService, etc.
    function VARCHAR(100),                               -- login, createDoc, etc.
    error_code VARCHAR(30),                              -- ERR_AUTH_001, etc.
    message TEXT NOT NULL,
    stack TEXT,
    request_id UUID,                                     -- x-request-id correlation
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    method VARCHAR(10),                                  -- GET, POST, PUT, DELETE, PATCH
    path TEXT,                                           -- /api/auth/login
    body JSONB,                                          -- sanitized request body
    headers JSONB,                                       -- sanitized headers
    status_code INTEGER,
    response_time INTEGER,                               -- ms
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_service ON error_logs(service);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_code ON error_logs(error_code);
CREATE INDEX IF NOT EXISTS idx_error_logs_request_id ON error_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);

-- Auto-cleanup: keep last 90 days (run via scheduler or cron)
-- DELETE FROM error_logs WHERE timestamp < NOW() - INTERVAL '90 days';
