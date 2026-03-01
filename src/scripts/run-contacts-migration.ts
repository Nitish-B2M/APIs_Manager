#!/usr/bin/env ts-node
import { query } from '../utils/db';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: __dirname + '/../../.env' });

async function runContactsMigration() {
    console.log('🔄 Running migration: Create contacts table...\n');

    try {
        const sqlPath = path.join(__dirname, '../db/025_contacts.sql');
        const sqlQuery = fs.readFileSync(sqlPath, 'utf8');

        await query(sqlQuery);

        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runContactsMigration();
