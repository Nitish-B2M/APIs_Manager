-- Migration 034: Optimistic concurrency control — version columns
ALTER TABLE requests ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE documentation ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
