-- Migration: Add webhook support for monitors
ALTER TABLE monitors
ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT,
ADD COLUMN IF NOT EXISTS "webhookType" VARCHAR(50) DEFAULT 'generic';