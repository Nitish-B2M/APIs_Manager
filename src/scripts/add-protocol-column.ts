#!/usr/bin/env ts-node
// ============================================
// Migration Script: Add protocol column to requests table
// Usage: npx ts-node src/scripts/add-protocol-column.ts
// ============================================

import { query } from '../utils/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function runMigration() {
    console.log('🔄 Running migration: Add protocol column to requests table...\n');

    try {
        // Add protocol column
        await query(`
            ALTER TABLE requests ADD COLUMN IF NOT EXISTS protocol TEXT DEFAULT 'REST';
        `);

        console.log('✅ Migration completed successfully!');

        // Verify the column was added
        const verifyResult = await query(`
            SELECT column_name, data_type, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'requests' AND column_name = 'protocol';
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
