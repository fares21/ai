import { Pool } from 'pg';

export const dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max:                    20,
    idleTimeoutMillis:   30000,
    connectionTimeoutMillis: 2000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

dbPool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error', err);
});
