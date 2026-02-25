#!/usr/bin/env ts-node
import { query } from '../utils/db';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: __dirname + '/../../.env' });

async function runMigration() {
    console.log('🔄 Running migration: 015_mock_responses.sql...\n');

    try {
        const sqlPath = path.join(__dirname, '../db/015_mock_responses.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Split by semicolon but be careful with complex statements
        const statements = sql
            .split(/;(?=\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|--|\s*$))/i)
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
            console.log(`Executing: ${stmt.substring(0, 50)}...`);
            await query(stmt);
        }

        console.log('✅ Migration completed successfully!');

        // Verify the table
        const verifyResult = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'mock_responses';
        `);

        if (verifyResult.rows.length > 0) {
            console.log('📋 Table mock_responses created successfully.');
        } else {
            console.error('❌ Table mock_responses was not found.');
        }

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
