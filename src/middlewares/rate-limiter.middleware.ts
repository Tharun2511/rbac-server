/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LAYER 6: RATE LIMITING WITH REDIS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Rate limiting = "only allow X requests in Y seconds from the same client."
 *
 * Example: 10 login attempts per 15 minutes per IP address.
 * The 11th attempt within that window gets rejected with HTTP 429 (Too Many Requests).
 *
 * ── WHY REDIS FOR RATE LIMITING? ──
 *
 * You COULD count requests in a JavaScript variable:
 *   const counts = new Map<string, number>();
 *
 * But that breaks in two scenarios:
 *   1. MULTIPLE SERVER INSTANCES: If you run 3 instances behind a load balancer,
 *      each has its own Map. An attacker hits instance A 10 times, then B 10 times,
 *      then C 10 times — 30 requests, but each instance only sees 10. Not limited!
 *
 *   2. SERVER RESTART: Your Map resets to empty. An attacker who was rate-limited
 *      gets a fresh counter just because the server restarted.
 *
 * Redis solves both:
 *   - All instances share the same Redis → same counter (shared state)
 *   - Redis persists between server restarts (or at minimum outlives them)
 *
 * ── NEW REDIS CONCEPT: INCR (Atomic Increment) ──
 *
 * INCR is one of the simplest yet most powerful Redis commands:
 *
 *   INCR mykey
 *     → If mykey doesn't exist: creates it with value 0, then increments to 1
 *     → If mykey exists: increments the value by 1
 *     → Returns the NEW value after incrementing
 *
 * "Atomic" means the read + increment + write happens as ONE indivisible operation.
 * Even if 100 requests call INCR on the same key at the exact same millisecond,
 * Redis processes them one by one (single-threaded) — no race conditions, no
 * lost updates, no double counting.
 *
 * Compare with a naive JavaScript approach:
 *   const count = await redis.get(key);      // Step 1: read → 5
 *   await redis.set(key, Number(count) + 1); // Step 2: write → 6
 *
 *   If two requests do this simultaneously:
 *     Request A: read → 5, write → 6
 *     Request B: read → 5, write → 6   ← WRONG! Should be 7
 *
 *   With INCR, this CANNOT happen. It's one atomic step:
 *     Request A: INCR → 6 (atomic)
 *     Request B: INCR → 7 (atomic) ← Always correct
 *
 * ── NEW REDIS CONCEPT: EXPIRE (Set TTL on existing key) ──
 *
 * You already know TTL from SET key value EX seconds (Layer 2).
 * EXPIRE is different — it sets a TTL on a key that ALREADY exists:
 *
 *   SET mykey "hello"     ← No TTL (lives forever)
 *   EXPIRE mykey 60       ← Now it expires in 60 seconds
 *
 * Why not just use SET with EX?
 *   Because INCR creates the key (if new). INCR doesn't accept EX flag.
 *   So the flow is:
 *     1. INCR key → creates key (or increments existing)
 *     2. If INCR returned 1 (first request in window) → EXPIRE key 900
 *
 *   This ensures the TTL is set ONLY when the counter starts.
 *   Subsequent INCRs don't reset the TTL (the window keeps counting down).
 *
 * ── THE FIXED WINDOW ALGORITHM ──
 *
 * This is the simplest rate limiting algorithm. Here's how it works:
 *
 *   Timeline:  |-------- 15 min window --------|-------- next window --------|
 *   Requests:  ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ⑪←BLOCKED  ① ② ③ ...
 *              ^                                ^
 *              Key created, EXPIRE set          Key expired, fresh counter
 *
 *   - Counter starts at 0, increments with each request
 *   - TTL = window duration (e.g., 15 minutes)
 *   - When count > limit → reject with 429
 *   - When TTL expires → key auto-deletes → counter resets naturally
 *
 * Tradeoff vs Sliding Window:
 *   Fixed window:    Simpler, 2 Redis commands (INCR + EXPIRE)
 *   Sliding window:  More accurate, but needs sorted sets (ZADD/ZRANGEBYSCORE)
 *   For login protection, fixed window is good enough.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

// ─── Configuration ──────────────────────────────────────────────────────────
//
// These are sensible defaults. The createRateLimiter() factory below
// lets you override them per-route.
//
// Why a factory function instead of a single middleware?
//   Different routes need different limits:
//     /login  → 10 attempts per 15 min (strict — brute force protection)
//     /refresh → 30 attempts per 15 min (lenient — legitimate tab refreshes)
//     /api/*  → 100 requests per min (general throttle)
//
//   A factory returns a CONFIGURED middleware for each use case.
//   This is the same pattern as requirePermission() in rbac.middleware.ts:
//     requirePermission('ticket.create')  → returns a middleware
//     createRateLimiter({ max: 10 })      → returns a middleware
//

interface RateLimiterOptions {
    /** Maximum number of requests allowed in the window */
    max: number;

    /** Time window in seconds (e.g., 900 = 15 minutes) */
    windowSeconds: number;

    /**
     * A label for the Redis key prefix — identifies WHAT is being rate-limited.
     * Example: "login" produces keys like ratelimit:login:192.168.1.1
     *
     * Why is this important?
     *   Without it, /login and /refresh would share the SAME counter.
     *   A user who refreshed 10 times would be blocked from logging in!
     *   Separate prefixes = separate counters.
     */
    keyPrefix: string;

    /** Custom message when rate limited (optional) */
    message?: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE RATE LIMITER FACTORY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This function RETURNS a middleware function. It doesn't run as middleware itself.
 * This is called a "factory" or "higher-order function":
 *
 *   const loginLimiter = createRateLimiter({ max: 10, windowSeconds: 900, keyPrefix: 'login' });
 *   router.post('/login', loginLimiter, authController.login);
 *                         ^^^^^^^^^^^^
 *                         This is the RETURNED middleware, not createRateLimiter itself
 *
 * Each call to createRateLimiter() produces an independent middleware with its
 * own config. The config is "closed over" (captured) by the returned function —
 * this is a JavaScript closure.
 */
export function createRateLimiter(options: RateLimiterOptions) {
    const {
        max,
        windowSeconds,
        keyPrefix,
        message = 'Too many requests, please try again later.',
    } = options;

    /**
     * ── THE MIDDLEWARE FUNCTION ──
     *
     * Express middleware signature: (req, res, next) => void
     *   - Call next() to pass the request to the next middleware/controller
     *   - Call res.status().json() to reject the request (stop the chain)
     *
     * This is async because Redis operations return Promises.
     * Express supports async middleware — if it throws, Express catches it.
     */
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // ── Step 1: Identify the client ──────────────────────────────
            //
            // We use the IP address as the identifier.
            //
            // req.ip returns the client's IP address. If behind a proxy
            // (nginx, AWS ALB), you need to configure Express:
            //   app.set('trust proxy', 1)
            // so that req.ip reads X-Forwarded-For instead of the proxy's IP.
            //
            // For an internal platform behind VPN, req.ip is typically the
            // employee's machine IP — unique enough for rate limiting.
            //
            const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

            // ── Step 2: Build the Redis key ──────────────────────────────
            //
            // Pattern: ratelimit:{action}:{identifier}
            //
            // Examples:
            //   ratelimit:login:192.168.1.42     — login attempts from this IP
            //   ratelimit:refresh:192.168.1.42   — refresh attempts from this IP
            //
            // Each key is an independent counter. The "action" segment ensures
            // different rate limits don't interfere with each other.
            //
            const key = `ratelimit:${keyPrefix}:${clientIp}`;

            // ── Step 3: INCR — Atomic Increment ──────────────────────────
            //
            // INCR key:
            //   - Key doesn't exist? → Creates it with value 1 (auto-init)
            //   - Key exists? → Increments by 1
            //   - Returns the NEW value
            //
            // This is the heart of the rate limiter. One command does:
            //   1. Read current count
            //   2. Add 1
            //   3. Write new count
            //   4. Return new count
            // All atomically — no race conditions even under high concurrency.
            //
            const currentCount = await redis.incr(key);

            // ── Step 4: EXPIRE — Set TTL on first request only ───────────
            //
            // When INCR returns 1, this is the FIRST request in a new window.
            // We set the TTL now so the key auto-deletes when the window ends.
            //
            // Why only when count === 1?
            //   If we called EXPIRE on every request, we'd RESET the window
            //   each time. A clever attacker could send 9 requests (just under
            //   limit), wait 14 minutes, send 1 more (resets TTL), and repeat
            //   forever — never getting blocked.
            //
            //   By setting EXPIRE only on the FIRST request:
            //     Request 1: INCR → 1, EXPIRE 900 ← window starts, 15 min countdown
            //     Request 2: INCR → 2             ← TTL NOT reset
            //     Request 10: INCR → 10           ← TTL NOT reset
            //     Request 11: INCR → 11           ← BLOCKED (429)
            //     ...15 min later: key expires, counter resets to 0
            //
            if (currentCount === 1) {
                await redis.expire(key, windowSeconds);
            }

            // ── Step 5: Check against the limit ──────────────────────────
            //
            // If currentCount exceeds max, the client has used up their quota.
            //
            if (currentCount > max) {
                // ── HTTP 429: Too Many Requests ──
                //
                // 429 is the standard HTTP status code for rate limiting.
                // It's NOT 400 (bad request) or 403 (forbidden) because:
                //   - 400 = your request is malformed
                //   - 403 = you don't have permission
                //   - 429 = your request is fine, but you're sending too many
                //
                // The difference matters for API clients:
                //   400 → fix your request body
                //   403 → check your credentials
                //   429 → slow down and retry later
                //

                // ── Retry-After Header ──
                //
                // Standard HTTP header that tells the client HOW LONG to wait
                // before retrying. Value is in seconds.
                //
                // TTL gives us the remaining time on the key (when the window resets).
                // If TTL returns -1 (no expiry) or -2 (key gone), fallback to windowSeconds.
                //
                const ttl = await redis.ttl(key);
                const retryAfter = ttl > 0 ? ttl : windowSeconds;

                res.set('Retry-After', String(retryAfter));
                res.status(429).json({
                    message,
                    retryAfter,
                });
                return; // Stop — do NOT call next()
            }

            // ── Step 6: Set informational response headers ───────────────
            //
            // These headers are not required by any spec, but they're a
            // widely-adopted convention (used by GitHub, Stripe, Twitter APIs):
            //
            //   X-RateLimit-Limit:     The max requests allowed in the window
            //   X-RateLimit-Remaining: How many requests the client has LEFT
            //   X-RateLimit-Reset:     Unix timestamp when the window resets
            //
            // These help API consumers build well-behaved clients:
            //   "I have 3 requests remaining, window resets in 8 minutes"
            //   → Client can throttle itself instead of hitting 429
            //
            const ttl = await redis.ttl(key);
            const resetTime = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : windowSeconds);

            res.set('X-RateLimit-Limit', String(max));
            res.set('X-RateLimit-Remaining', String(Math.max(0, max - currentCount)));
            res.set('X-RateLimit-Reset', String(resetTime));

            // ── Step 7: Allow the request through ────────────────────────
            //
            // Under the limit → call next() to pass to the next middleware
            // or the route handler (e.g., authController.login).
            //
            next();
        } catch (err) {
            // ── Graceful Degradation ─────────────────────────────────────
            //
            // If Redis is down, we CANNOT check the rate limit.
            // Two possible strategies:
            //
            //   FAIL OPEN  → allow the request (no rate limiting)
            //   FAIL CLOSED → block the request (deny everything)
            //
            // We choose FAIL OPEN. Why?
            //   - This is an internal platform, not a public API
            //   - Blocking legitimate employees because Redis hiccupped is worse
            //     than temporarily losing rate limiting
            //   - Redis downtime is typically short (auto-reconnect handles it)
            //
            // For a public-facing API handling payments or auth, you might
            // choose FAIL CLOSED instead — security over availability.
            //
            console.warn('[RateLimiter] Redis unavailable, allowing request through:', err);
            next();
        }
    };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PRE-CONFIGURED RATE LIMITERS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Ready-to-use middleware instances for common use cases.
 * Import these directly in route files:
 *
 *   import { loginRateLimiter } from '../../middlewares/rate-limiter.middleware';
 *   router.post('/login', loginRateLimiter, authController.login);
 */

// ── Login Rate Limiter ───────────────────────────────────────────────────────
//
// STRICT: 10 attempts per 15 minutes per IP
//
// Why strict? Login is the #1 brute force target.
// An attacker trying common passwords needs hundreds/thousands of attempts.
// 10 per 15 minutes makes brute force impractical while letting real users
// who mistype their password retry a few times.
//
export const loginRateLimiter = createRateLimiter({
    max: 10,
    windowSeconds: 15 * 60, // 15 minutes = 900 seconds
    keyPrefix: 'login',
    message: 'Too many login attempts. Please try again after 15 minutes.',
});

// ── Refresh Token Rate Limiter ───────────────────────────────────────────────
//
// LENIENT: 30 attempts per 15 minutes per IP
//
// Why more lenient than login?
//   - Token refresh is automated (browser does it, not the user)
//   - A user with multiple tabs open might trigger several refreshes at once
//   - Legitimate usage spikes are more common than for login
//   - But we still limit it to prevent token-guessing attacks
//
export const refreshRateLimiter = createRateLimiter({
    max: 30,
    windowSeconds: 15 * 60, // 15 minutes = 900 seconds
    keyPrefix: 'refresh',
    message: 'Too many refresh attempts. Please try again later.',
});
