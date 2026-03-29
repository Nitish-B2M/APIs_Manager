/**
 * Database Migration Runner — tracks applied migrations and runs new ones.
 * Usage: npx ts-node src/db/migrate.ts
 */
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureTrackingTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
}

async function getAppliedMigrations(): Promise<string[]> {
    const { rows } = await pool.query('SELECT name FROM _migrations ORDER BY id ASC');
    return rows.map(r => r.name);
}

async function runMigrations() {
    await ensureTrackingTable();
    const applied = await getAppliedMigrations();

    const migrationDir = path.resolve(__dirname);
    const files = fs.readdirSync(migrationDir)
        .filter(f => f.endsWith('.sql') && /^\d{3}_/.test(f))
        .sort();

    let newCount = 0;
    for (const file of files) {
        if (applied.includes(file)) continue;

        console.log(`[migrate] Applying: ${file}`);
        const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');

        try {
            // Split by semicolons for CONCURRENTLY indexes (can't run in transaction)
            if (sql.includes('CONCURRENTLY')) {
                const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 5);
                for (const stmt of statements) {
                    try { await pool.query(stmt); } catch (e: any) { console.log(`  [skip] ${e.message.substring(0, 60)}`); }
                }
            } else {
                await pool.query(sql);
            }

            await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
            console.log(`  [done] ${file}`);
            newCount++;
        } catch (err: any) {
            console.error(`  [FAIL] ${file}: ${err.message}`);
            // Continue to next migration (don't stop on error)
        }
    }

    console.log(`[migrate] Complete: ${newCount} new migrations applied (${applied.length + newCount} total)`);
}

async function rollbackLast() {
    await ensureTrackingTable();
    const { rows } = await pool.query('SELECT name FROM _migrations ORDER BY id DESC LIMIT 1');
    if (rows.length === 0) {
        console.log('[migrate] No migrations to rollback');
        return;
    }

    const name = rows[0].name;
    console.log(`[migrate] Rolling back: ${name}`);
    await pool.query('DELETE FROM _migrations WHERE name = $1', [name]);
    console.log(`  [done] Removed ${name} from tracking (SQL not reversed — manual cleanup needed)`);
}

async function status() {
    await ensureTrackingTable();
    const applied = await getAppliedMigrations();

    const migrationDir = path.resolve(__dirname);
    const files = fs.readdirSync(migrationDir)
        .filter(f => f.endsWith('.sql') && /^\d{3}_/.test(f))
        .sort();

    console.log(`[migrate] Status: ${applied.length}/${files.length} applied\n`);
    for (const file of files) {
        const marker = applied.includes(file) ? '✓' : '○';
        console.log(`  ${marker} ${file}`);
    }
}

// CLI
const command = process.argv[2] || 'up';
(async () => {
    try {
        if (command === 'up') await runMigrations();
        else if (command === 'down') await rollbackLast();
        else if (command === 'status') await status();
        else console.log('Usage: migrate.ts [up|down|status]');
    } finally {
        await pool.end();
    }
})();
