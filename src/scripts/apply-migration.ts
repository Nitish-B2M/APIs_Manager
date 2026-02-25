import { query } from '../utils/db';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runMigration() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: npx ts-node apply-migration.ts <migration-file.sql>');
        process.exit(1);
    }

    const migrationFile = args[0];
    const migrationPath = path.isAbsolute(migrationFile) ? migrationFile : path.join(process.cwd(), migrationFile);

    if (!fs.existsSync(migrationPath)) {
        console.error(`File not found: ${migrationPath}`);
        process.exit(1);
    }

    try {
        console.log(`🔄 Running migration: ${path.basename(migrationPath)}...\n`);
        const sql = fs.readFileSync(migrationPath, 'utf-8');

        // Simple split by semicolon (for single statements this is fine)
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
            console.log(`Executing: ${stmt.substring(0, 50)}...`);
            await query(stmt);
        }

        console.log('\n✅ Migration completed successfully!');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
