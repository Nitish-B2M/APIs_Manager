import { query } from '../utils/db';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
    try {
        console.log('Running folders migration...');
        
        const migrationPath = path.join(__dirname, '001_folders.sql');
        const sql = fs.readFileSync(migrationPath, 'utf-8');
        
        // Split by semicolons but be careful with function bodies
        const statements = sql
            .split(/;(?=\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|--|\s*$))/i)
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));
        
        for (const stmt of statements) {
            if (stmt.trim()) {
                console.log(`Executing: ${stmt.substring(0, 50)}...`);
                await query(stmt);
            }
        }
        
        console.log('Migration completed successfully!');
        
        // Verify the migration
        const result = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'folders' OR (table_name = 'requests' AND column_name = 'folderId')
            ORDER BY table_name, ordinal_position
        `);
        
        console.log('\nVerification - Tables structure:');
        console.log(result.rows);
        
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
