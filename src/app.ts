import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { redis } from './config/redis';

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use(morgan('dev'));

app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});

// ─── REDIS HEALTH CHECK ────────────────────────────────────────────────────
//
// REDIS CONCEPT: The PING Command
//
// PING is the simplest command in Redis. It exists solely to test if the
// connection is alive:
//   Client sends:  PING
//   Server replies: PONG
//
// That's it. No data is read or written. It's like a heartbeat monitor.
//
// In ioredis, `redis.ping()` returns a Promise that resolves to "PONG".
// If Redis is unreachable, the Promise rejects with an error.
//
// WHY A SEPARATE ENDPOINT?
//   The existing `/health` endpoint checks if Express is running.
//   `/health/redis` checks if the Redis connection is alive.
//   In production, monitoring tools (like Kubernetes health probes or
//   AWS load balancers) use these to decide if the server is healthy.
//
//   You could also combine them:
//     GET /health → { express: "ok", postgres: "ok", redis: "ok" }
//   But separate endpoints let you pinpoint WHICH service is down.
//
// HTTP STATUS CODES:
//   200 = Redis is reachable, all good
//   503 = "Service Unavailable" — Redis is down but the server itself is running
//         (NOT 500, because 500 means "our code crashed", 503 means "a dependency is down")
//
app.get('/health/redis', async (_req, res) => {
    try {
        const pong = await redis.ping();
        res.status(200).json({ status: 'ok', redis: pong });
    } catch (err) {
        res.status(503).json({ status: 'error', redis: 'disconnected' });
    }
});

app.use('/api', routes);

export default app;
