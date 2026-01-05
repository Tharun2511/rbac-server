import { Pool } from 'pg';
import { env } from './env';

export const db = new Pool({
    connectionString: env.DATABASE_URL,
});

db.on('connect', () => {
    console.log('✅ PostgreSQL connected');
});

db.on('error', (err) => {
    console.error('❌ PostgreSQL connection error', err);
    process.exit(1);
});
