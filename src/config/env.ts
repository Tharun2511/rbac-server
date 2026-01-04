import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string, value?: string): string {
  if (!value) {
    throw new Error(`❌ Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  PORT: requireEnv('PORT', process.env.PORT),
  DATABASE_URL: requireEnv('DATABASE_URL', process.env.DATABASE_URL),
  JWT_SECRET: requireEnv('JWT_SECRET', process.env.JWT_SECRET),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
};
