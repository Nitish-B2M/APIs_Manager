#!/usr/bin/env ts-node
// ============================================
// Migration Script: Add history column to requests table
// Usage: npx ts-node scripts/run-migration.ts
// ============================================

import { query } from '../utils/db';
import dotenv from 'dotenv';

dotenv.config({ path: __dirname + '/../../.env' });

async function runMigration() {
    console.log('🔄 Running migration: Add history column to requests table...\n');

    try {
        // Add history column
        await query(`
            ALTER TABLE requests ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb;
        `);

        console.log('✅ Migration completed successfully!');

        // Verify the column was added
        const verifyResult = await query(`
            SELECT column_name, data_type, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'requests' AND column_name = 'history';
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
