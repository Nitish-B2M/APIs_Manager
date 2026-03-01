import { query } from '../utils/db';
import bcrypt from 'bcryptjs';

async function setup() {
    try {
        const email = 'admin@example.com';
        const password = 'Password@123';
        const hashedPassword = await bcrypt.hash(password, 10);

        const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
        if (rows.length === 0) {
            await query(
                'INSERT INTO users (email, password, is_admin) VALUES ($1, $2, $3)',
                [email, hashedPassword, true]
            );
            console.log('Admin user created: admin@example.com / Password@123');
        } else {
            await query('UPDATE users SET is_admin = true WHERE email = $1', [email]);
            console.log('User admin@example.com promoted to Admin');
        }
    } catch (error) {
        console.error('Setup failed:', error);
    } finally {
        process.exit();
    }
}

setup();
