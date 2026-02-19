
import { query } from '../utils/db';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runMigration() {
    console.log('🔄 Running migration: Create password_reset_tokens table...\n');

    try {
        const sqlPath = path.join(__dirname, '../db/011_password_reset.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        await query(sql);

        console.log('✅ Migration completed successfully!');

        // Verify the table was created
        const verifyResult = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'password_reset_tokens';
        `);

        console.log('\n📋 Table details:');
        console.table(verifyResult.rows);

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
