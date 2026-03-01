#!/usr/bin/env ts-node
import { query } from '../utils/db';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runSchedulerMigration() {
    console.log('🔄 Running Scheduler Migration: 024_add_scheduler_tables.sql...\n');

    try {
        const sqlPath = path.join(__dirname, '../db/024_add_scheduler_tables.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Split by semicolons but ignore those inside trigger functions
        // A simple approach is to replace common delimiters or use a more robust parser
        // For this specific SQL, we can execute the whole block if the driver supports it
        // Or split carefully.

        await query(sql);

        console.log('✅ Scheduler tables created successfully!');

        const tables = ['scheduler_settings', 'scheduler_tasks', 'scheduler_habits', 'scheduler_events'];

        console.log('\n📋 Verification:');
        for (const table of tables) {
            const result = await query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_name = '${table}';
            `);
            if (result.rows.length > 0) {
                console.log(`  [OK] Table '${table}' exists.`);
            } else {
                console.log(`  [FAIL] Table '${table}' missing.`);
            }
        }

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runSchedulerMigration();
