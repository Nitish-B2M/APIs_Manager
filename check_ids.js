const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:root@localhost:5432/devmanus_docs' });

async function check() {
    try {
        console.log('--- Counts ---');
        const dCount = await pool.query('SELECT count(*) FROM documentation');
        const rCount = await pool.query('SELECT count(*) FROM requests');
        const uCount = await pool.query('SELECT count(*) FROM users');
        console.log(`Docs: ${dCount.rows[0].count}, Requests: ${rCount.rows[0].count}, Users: ${uCount.rows[0].count}`);

        const targetId = '1e875998-295a-4a47-943c-dfbb68961bd5';
        const { rows: users } = await pool.query('SELECT * FROM users WHERE id = $1', [targetId]);
        console.log(`\nChecking ID from Curl: ${targetId}`);
        console.log(`Found? ${users.length > 0 ? 'YES' : 'NO'}`);

        if (users.length === 0) {
            const allUsers = await pool.query('SELECT id, email FROM users');
            console.log('\nAvailable Users in DB:');
            console.table(allUsers.rows);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
