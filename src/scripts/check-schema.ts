import { query } from '../utils/db';

async function checkSchema() {
    try {
        const { rows } = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users'
        `);
        console.log('Columns in users table:');
        rows.forEach(row => console.log(`- ${row.column_name} (${row.data_type})`));

        const { rows: tables } = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('\nTables in public schema:');
        tables.forEach(table => console.log(`- ${table.table_name}`));
    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        process.exit();
    }
}

checkSchema();
