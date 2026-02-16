import { Pool, PoolConfig } from 'pg';
import { env } from './env';

const parseConnectionString = (connectionString: string): PoolConfig => {
  try {
    // Try standard parsing first
    const url = new URL(connectionString);
    return {
      connectionString, // pg will handle it if it's valid
    };
  } catch (e) {
    // Fallback for special characters (like #) in password
    console.warn('⚠️ Standard URL parsing failed, attempting manual parse...');
    
    // Remove protocol
    const clean = connectionString.replace(/^postgres(ql)?:\/\//, '');
    
    // Split by LAST @ to separate auth from host
    const lastAt = clean.lastIndexOf('@');
    if (lastAt === -1) throw new Error('Invalid connection string format');
    
    const auth = clean.substring(0, lastAt);
    const rest = clean.substring(lastAt + 1);
    
    // Split auth by FIRST :
    const firstColon = auth.indexOf(':');
    if (firstColon === -1) throw new Error('Invalid auth format');
    
    const user = auth.substring(0, firstColon);
    const password = auth.substring(firstColon + 1);
    
    // Parse host, port, db
    // rest is like "host:port/db" or "host/db"
    const [hostPort, dbName] = rest.split('/');
    const [host, port] = hostPort.split(':');
    
    return {
      user,
      password, // No decoding needed as we took it raw
      host,
      port: parseInt(port) || 5432,
      database: dbName || 'postgres',
      ssl: { rejectUnauthorized: false }
    };
  }
};

const config = parseConnectionString(env.DATABASE_URL);

export const db = new Pool(config);

db.on('connect', () => {
    console.log('✅ PostgreSQL connected');
});

db.on('error', (err) => {
    console.error('❌ PostgreSQL connection error', err);
    process.exit(1);
});
