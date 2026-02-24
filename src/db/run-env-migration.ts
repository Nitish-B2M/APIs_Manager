import { query } from '../utils/db';
import * as fs from 'fs';
import * as path from 'path';

async function runEnvMigration() {
    try {
        console.log('Running global variables and secrets migration...');

        const migrationPath = path.join(__dirname, '012_global_variables_and_secrets.sql');
        const sql = fs.readFileSync(migrationPath, 'utf-8');

        // Strip SQL comments and execute the entire file as one block
        const cleanSql = sql
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n')
            .trim();

        console.log('Executing migration SQL...');
        await query(cleanSql);

        console.log('Migration completed successfully!');

        // Verify
        const verifyResult = await query(
            `SELECT column_name, data_type 
             FROM information_schema.columns 
             WHERE table_name = 'environments' 
             ORDER BY ordinal_position`
        );
        console.log('\nColumns after migration:');
        console.table(verifyResult.rows);

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runEnvMigration();
