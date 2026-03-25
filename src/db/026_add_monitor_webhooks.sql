-- Active: 1767984521643@@127.0.0.1@5432@devmanus_docs
-- Add Webhook support to Monitors
ALTER TABLE monitors
ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT,
ADD COLUMN IF NOT EXISTS "webhookSecret" TEXT;