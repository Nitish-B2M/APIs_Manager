import { query } from './db';

async function runWorkspaceIntegrationMigration() {
    try {
        console.log('Running workspace integration migration (notes & todos polymorphic relationships)...');

        // Add to tracking notes
        console.log('Adding referenceId and referenceType to notes...');
        await query(`ALTER TABLE notes ADD COLUMN IF NOT EXISTS "referenceId" UUID`);
        await query(`ALTER TABLE notes ADD COLUMN IF NOT EXISTS "referenceType" TEXT`);
        
        // Add to tracking todos
        console.log('Adding referenceId and referenceType to todos...');
        await query(`ALTER TABLE todos ADD COLUMN IF NOT EXISTS "referenceId" UUID`);
        await query(`ALTER TABLE todos ADD COLUMN IF NOT EXISTS "referenceType" TEXT`);

        console.log('Creating indexes for performance...');
        await query(`CREATE INDEX IF NOT EXISTS idx_notes_reference ON notes("referenceId", "referenceType")`);
        await query(`CREATE INDEX IF NOT EXISTS idx_todos_reference ON todos("referenceId", "referenceType")`);

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runWorkspaceIntegrationMigration();
