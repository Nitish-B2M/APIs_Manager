import { query } from '../utils/db';
import * as fs from 'fs';
import * as path from 'path';

async function runAuthMigration() {
    try {
        console.log('Running auth migration (013)...');
        const migrationPath = path.join(__dirname, '013_request_auth.sql');
        const sql = fs.readFileSync(migrationPath, 'utf-8')
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n')
            .trim();

        await query(sql);
        console.log('Migration 013 applied successfully!');

        const verifyResult = await query(
            `SELECT column_name, data_type, column_default 
             FROM information_schema.columns 
             WHERE table_name = 'requests' AND column_name = 'auth'`
        );
        console.log('Verification:');
        console.table(verifyResult.rows);
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runAuthMigration();
