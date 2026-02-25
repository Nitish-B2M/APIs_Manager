import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log(`Connecting to DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}`);

        const sqlPath = path.join(__dirname, '../db/019_collaboration_rbac.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('🔄 Running migration: 019_collaboration_rbac.sql...');
        await client.query(sql);
        console.log('✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigration();
