#!/usr/bin/env ts-node
import { query } from '../utils/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function migrate() {
    console.log('🔄 Applying migration: Add webhook support for monitors...');
    try {
        await query(`
            ALTER TABLE monitors 
            ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT,
            ADD COLUMN IF NOT EXISTS "webhookType" VARCHAR(50) DEFAULT 'generic';
        `);
        console.log('✅ Migration successful!');
        process.exit(0);
    } catch (err: any) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
