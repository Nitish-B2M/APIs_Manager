import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isLocalhost = process.env.DATABASE_URL?.includes('localhost');

const poolConfig: PoolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },

    // Connection pool tuning
    min: 2,                          // Keep at least 2 idle connections
    max: 20,                         // Max 20 simultaneous connections
    idleTimeoutMillis: 30000,        // Close idle connections after 30s
    connectionTimeoutMillis: 5000,   // Fail if can't connect in 5s
    statement_timeout: 30000,        // Kill queries running > 30s
};

console.log(`[DB] Connecting to: ${process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':****@')} (pool: ${poolConfig.min}-${poolConfig.max})`);

const pool = new Pool(poolConfig);

// Log pool errors (don't crash the app)
pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});

// Health check function
export async function checkDbHealth(): Promise<{ connected: boolean; latencyMs: number; activeConnections: number; idleConnections: number }> {
    const start = Date.now();
    try {
        await pool.query('SELECT 1');
        return {
            connected: true,
            latencyMs: Date.now() - start,
            activeConnections: pool.totalCount - pool.idleCount,
            idleConnections: pool.idleCount,
        };
    } catch {
        return { connected: false, latencyMs: Date.now() - start, activeConnections: 0, idleConnections: 0 };
    }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
    console.log('[DB] Draining connection pool...');
    await pool.end();
    console.log('[DB] Pool closed.');
}

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
