#!/usr/bin/env ts-node
import { query } from '../utils/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runSchemaMigration() {
    console.log('🔄 Running migration: Add responseSchema column to requests table...\n');

    try {
        await query(`
            ALTER TABLE requests ADD COLUMN IF NOT EXISTS "responseSchema" JSONB;
        `);

        console.log('✅ Migration completed successfully!');

        const verifyResult = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'requests' AND column_name = 'responseSchema';
        `);

        console.log('\n📋 Column details:');
        console.table(verifyResult.rows);

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runSchemaMigration();
