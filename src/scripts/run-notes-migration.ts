import { query } from '../utils/db';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
    try {
        console.log('Running notes migration...');

        const migrationPath = path.join(__dirname, '../db/005_notes.sql');
        const sql = fs.readFileSync(migrationPath, 'utf-8');

        const statements = sql
            .split(/;(?=\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|--|\s*$))/i)
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
            if (stmt.trim()) {
                console.log(`Executing: ${stmt.substring(0, 60)}...`);
                await query(stmt);
            }
        }

        console.log('Migration completed successfully!');

        const result = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'notes'
            ORDER BY ordinal_position
        `);

        console.log('\nVerification - Notes table structure:');
        console.log(result.rows);

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
