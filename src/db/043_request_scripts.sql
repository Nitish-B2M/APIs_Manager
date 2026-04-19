-- ═══════════════════════════════════════════════════════════════════
-- Migration 043: Pre/Post Request Scripts
-- Adds script columns to requests table for sandboxed JS execution
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE requests ADD COLUMN IF NOT EXISTS pre_script TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS post_script TEXT;
