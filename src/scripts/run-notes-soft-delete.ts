#!/usr/bin/env ts-node
// ============================================
// Migration Script: Add soft delete columns to notes table
// usage: npx ts-node src/scripts/run-notes-soft-delete.ts
// ============================================

import { query } from '../utils/db';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: __dirname + '/../../.env' });

async function runMigration() {
    console.log('🔄 Running migration: 006_notes_soft_delete.sql ...\n');

    try {
        const sqlPath = path.join(__dirname, '../db/006_notes_soft_delete.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        await query(sql);

        console.log('✅ Migration completed successfully!');

        // Verification
        const verify = await query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'notes' AND column_name = 'is_deleted';
        `);

        if (verify.rows.length > 0) {
            console.log('✅ Verified: is_deleted column exists.');
        } else {
            console.error('❌ Verification failed: column not found.');
        }

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
