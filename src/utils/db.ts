import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Ensure .env is loaded
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log(`Connecting to DB: ${process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':****@')}`);
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
