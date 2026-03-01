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
  SALT_ROUNDS: Number(process.env.SALT_ROUNDS) || 10,

  // ─── REDIS CONNECTION ─────────────────────────────────────────────
  // Notice we use `?? 'default'` instead of `requireEnv()`.
  //
  // WHY? Compare with DATABASE_URL above which uses requireEnv() — if PostgreSQL
  // is missing, the app CRASHES because it's the source of truth.
  //
  // Redis is a CACHE. If it's missing, the app should still work (just slower).
  // Using `??` means: "use the env var if it exists, otherwise fall back to localhost."
  // This is the first example of the "graceful degradation" principle:
  //   PostgreSQL missing = FATAL (can't serve data)
  //   Redis missing      = DEGRADED (can still serve data, just slower from DB)
  //
  // Connection string format: redis://[username:password@]host[:port][/database]
  //   - redis://localhost:6379      → local, no auth, default port
  //   - redis://:mypass@host:6379   → with password (username is empty)
  //   - redis://host:6379/2         → use database 2 instead of default 0
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
};
