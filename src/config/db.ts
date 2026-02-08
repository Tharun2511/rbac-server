import { Pool } from 'pg';
import { env } from './env';
import logger from '../utils/logger';



export const db = new Pool({
    connectionString: env.DATABASE_URL,
});

db.on('connect', () => {
    logger.info('✅ PostgreSQL connected');
});

db.on('error', (err) => {
    logger.error('❌ PostgreSQL connection error', err);
    process.exit(1);
});
