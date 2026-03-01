import app from './app';
import { env } from './config/env';
import { permissionCache } from './rbac/permission-cache';
import { redis } from './config/redis';

const PORT = env.PORT || 4000;

(async () => {
    try {
        // ─── REDIS STARTUP CHECK (NON-BLOCKING) ────────────────────────
        //
        // We verify Redis is reachable BEFORE starting the server.
        // But notice this is inside its own try/catch — if Redis is down,
        // we WARN and CONTINUE, we don't crash.
        //
        // Compare with permissionCache.ensureLoaded() below which is NOT
        // wrapped in its own try/catch — if THAT fails, the outer catch
        // triggers process.exit(1). Because permissions come from PostgreSQL
        // and are essential.
        //
        // This is graceful degradation in action:
        //   Redis down at startup   → warn, start anyway, app works (slower)
        //   Postgres down at startup → crash, app can't function
        //
        try {
            const pong = await redis.ping();
            console.log(`Redis: ${pong} received — connection verified`);
        } catch (err) {
            console.warn('Redis: unavailable at startup. App will work without caching.');
            console.warn('  To start Redis: docker run -d --name redis -p 6379:6379 redis:7-alpine');
        }

        await permissionCache.ensureLoaded();
        app.listen(Number(PORT), () => console.log(`🚀 Server running on port ${PORT}`));
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
})();
