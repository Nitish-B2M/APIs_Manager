import { query } from '../utils/db';

async function migrate() {
    try {
        console.log('Running migration...');
        await query('ALTER TABLE documentation ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN DEFAULT FALSE;');
        console.log('Migration successful: Added isPublic column.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

migrate();
