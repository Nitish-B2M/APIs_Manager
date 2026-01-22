import { query } from '../utils/db';
import fs from 'fs';
import path from 'path';

const initDb = async () => {
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        console.log('Dropping existing tables...');
        try {
            await query('DROP TABLE IF EXISTS documentation CASCADE');
            // users table can stay if we want, but schema.sql creates both IF NOT EXISTS. 
            // For now let's just drop documentation to reset the schema for content type change.
        } catch (e) {
            console.log('Error dropping tables (ignorable if first run):', e);
        }

        console.log('Running schema migration...');
        await query(schema);
        console.log('Database initialized successfully.');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
};

initDb();
