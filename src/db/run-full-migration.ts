import { query } from '../utils/db';

async function runFullMigration() {
    try {
        console.log('Running full folders migration...');
        
        // 1. Check if folders table exists
        const tableCheck = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'folders'
            );
        `);
        
        const tableExists = tableCheck.rows[0].exists;
        console.log('Folders table exists:', tableExists);
        
        if (!tableExists) {
            // Create folders table
            console.log('Creating folders table...');
            await query(`
                CREATE TABLE folders (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    "documentationId" UUID NOT NULL REFERENCES documentation(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    description TEXT,
                    "parentId" UUID REFERENCES folders(id) ON DELETE CASCADE,
                    "order" INTEGER DEFAULT 0,
                    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('Folders table created!');
        } else {
            // Check if description column exists
            const descCheck = await query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = 'folders' AND column_name = 'description'
            `);
            
            if (descCheck.rows.length === 0) {
                console.log('Adding description column to folders...');
                await query('ALTER TABLE folders ADD COLUMN IF NOT EXISTS description TEXT');
            }
        }
        
        // 2. Check if folderId column exists in requests
        const folderIdCheck = await query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'requests' AND column_name = 'folderId'
        `);
        
        if (folderIdCheck.rows.length === 0) {
            console.log('Adding folderId column to requests...');
            await query('ALTER TABLE requests ADD COLUMN IF NOT EXISTS "folderId" UUID REFERENCES folders(id) ON DELETE SET NULL');
        } else {
            console.log('folderId column already exists in requests');
        }
        
        // 3. Create indexes
        console.log('Creating indexes...');
        await query('CREATE INDEX IF NOT EXISTS idx_folders_documentation ON folders("documentationId")');
        await query('CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders("parentId")');
        await query('CREATE INDEX IF NOT EXISTS idx_requests_folder ON requests("folderId")');
        
        // 4. Create trigger function
        console.log('Creating trigger function...');
        await query(`
            CREATE OR REPLACE FUNCTION update_folders_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW."updatedAt" = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `);
        
        // 5. Create trigger
        console.log('Creating trigger...');
        await query('DROP TRIGGER IF EXISTS trigger_folders_updated_at ON folders');
        await query(`
            CREATE TRIGGER trigger_folders_updated_at
            BEFORE UPDATE ON folders
            FOR EACH ROW
            EXECUTE FUNCTION update_folders_updated_at()
        `);
        
        console.log('\n=== Migration completed successfully! ===\n');
        
        // Verify the migration
        const foldersResult = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'folders'
            ORDER BY ordinal_position
        `);
        
        console.log('Folders table columns:');
        foldersResult.rows.forEach((row: any) => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });
        
        const requestsResult = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'requests' AND column_name = 'folderId'
        `);
        
        console.log('\nRequests.folderId column:');
        requestsResult.rows.forEach((row: any) => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });
        
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runFullMigration();
