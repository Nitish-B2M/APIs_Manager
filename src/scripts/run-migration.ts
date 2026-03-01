#!/usr/bin/env ts-node
// ============================================
// Migration Script: Add history column to requests table
// Usage: npx ts-node scripts/run-migration.ts
// ============================================

import { query } from '../utils/db';
import dotenv from 'dotenv';

dotenv.config({ path: __dirname + '/../../.env' });

async function runMigration() {
    console.log('🔄 Running migration: Add settings column to users table...\n');

    try {
        // Add settings column to users table
        await query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
        `);

        console.log('✅ Migration completed successfully!');

        // Verify the column was added
        const verifyResult = await query(`
            SELECT column_name, data_type, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'settings';
        `);

        console.log('\n📋 Column details:');
        console.table(verifyResult.rows);

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
