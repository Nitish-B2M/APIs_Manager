import { query } from '../utils/db';
import * as fs from 'fs';
import * as path from 'path';

async function runEmailMigration() {
    try {
        console.log('Running Email Templates migration...');

        const migrationPath = path.join(__dirname, '020_dynamic_email_templates.sql');
        const sql = fs.readFileSync(migrationPath, 'utf-8');

        console.log('Executing migration script...');
        await query(sql);

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runEmailMigration();
