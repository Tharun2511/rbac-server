# Layer 6: Rate Limiting with Redis — Explanation

## What Changed

| Before | After |
|---|---|
| `/login` and `/refresh` had no request limits | Rate-limited: 10 login / 30 refresh per 15 min per IP |
| No protection against brute force | Excess requests rejected with HTTP 429 |
| No Redis involvement in request flow | Redis INCR + EXPIRE count requests per IP |

### Files Created/Modified

| File | Change |
|---|---|
| `src/middlewares/rate-limiter.middleware.ts` | **NEW** — Factory + two pre-configured limiters |
| `src/modules/auth/auth.routes.ts` | **MODIFIED** — Added rate limiter middleware to `/login` and `/refresh` |

---

## New Redis Concepts

### 1. INCR — Atomic Increment

INCR is the core of the rate limiter. One command that does four things atomically:

```
INCR ratelimit:login:192.168.1.42

  Key doesn't exist?  → Create with value 0, increment to 1, return 1
  Key exists (value 5)? → Increment to 6, return 6
```

**"Atomic" means indivisible.** Redis is single-threaded — it processes one command at a time. Even if 100 requests hit INCR simultaneously, Redis queues them and increments one by one. No race conditions.

#### Why Atomicity Matters

Compare INCR with a naive GET + SET approach:

```
NON-ATOMIC (BROKEN):
  Request A: GET → 5        ← reads 5
  Request B: GET → 5        ← also reads 5 (race condition!)
  Request A: SET → 6        ← writes 6
  Request B: SET → 6        ← writes 6 (should be 7!)

  Result: Count is 6, but 2 requests came in. Lost one!

ATOMIC (INCR):
  Request A: INCR → 6       ← atomic read+increment+write
  Request B: INCR → 7       ← atomic read+increment+write

  Result: Count is 7. Always correct.
```

This is why INCR exists as a dedicated command — it's not just a shortcut for GET + SET, it's a fundamentally different (thread-safe) operation.

### 2. EXPIRE — Set TTL on Existing Key

You already know TTL from `SET key value EX seconds` (Layer 2). EXPIRE is the standalone version — it adds a TTL to a key that already exists:

```
INCR mykey          ← Creates key with value 1 (no TTL)
EXPIRE mykey 900    ← Now it expires in 900 seconds (15 minutes)
```

**Why not use SET with EX?** Because INCR creates/updates the key. INCR doesn't accept an EX flag. So we need two separate commands:

```
Step 1: INCR key    → returns new count
Step 2: EXPIRE key  → only if count === 1 (first request in window)
```

**Critical: EXPIRE only on count === 1.** If we called EXPIRE on every request, the window would reset with each request. An attacker could keep the window open indefinitely by sending requests just below the limit.

### 3. TTL — Get Remaining Time

```
TTL ratelimit:login:192.168.1.42
  → 547    (547 seconds remaining before expiry)
  → -1     (key exists but has no TTL)
  → -2     (key doesn't exist)
```

We use TTL for two things:
1. **Retry-After header**: Tell rate-limited clients when they can retry
2. **X-RateLimit-Reset header**: Tell clients when the window resets

---

## The Fixed Window Algorithm

### How It Works

```
Timeline:

  |◄──────── 15 minute window ──────────►|◄──────── next window ──────────►|

  ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩  ⑪ ⑫ ⑬         ① ② ③ ④ ...
  ↑                        ↑  ↑  ↑         ↑
  Key created              │  │  │         Key expired → fresh start
  EXPIRE 900 set           │  │  │
                           │  │  └─ 429 Too Many Requests
                           │  └──── 429 Too Many Requests
                           └─────── 429 Too Many Requests (count > 10)
```

### Step-by-Step for a Single Request

```
1. Client sends POST /api/auth/login
2. Express runs: loginRateLimiter → authController.login

3. loginRateLimiter:
   a) Get client IP: req.ip → "192.168.1.42"
   b) Build key: "ratelimit:login:192.168.1.42"
   c) INCR key → returns current count (e.g., 3)
   d) If count === 1 → EXPIRE key 900 (start the 15-min window)
   e) If count > 10 → respond 429, STOP (don't call next())
   f) If count ≤ 10 → set X-RateLimit headers, call next()

4. authController.login runs (only if step 3f)
```

### Redis State Over Time

```
Time 0:00 — First login attempt
  INCR ratelimit:login:192.168.1.42 → 1
  EXPIRE ratelimit:login:192.168.1.42 900
  → Allowed ✓

Time 0:05 — Second login attempt
  INCR ratelimit:login:192.168.1.42 → 2
  (no EXPIRE — only on first request)
  → Allowed ✓

Time 2:30 — 10th login attempt
  INCR ratelimit:login:192.168.1.42 → 10
  → Allowed ✓ (at the limit)

Time 2:35 — 11th login attempt
  INCR ratelimit:login:192.168.1.42 → 11
  → BLOCKED ✗ (429 Too Many Requests)
  → Retry-After: 747 seconds (remaining TTL)

Time 15:00 — Key expires (TTL reached 0)
  Redis auto-deletes: ratelimit:login:192.168.1.42
  → Next request starts fresh at count 1
```

---

## The Factory Pattern

### Why a Factory?

Different endpoints need different limits. A single hardcoded middleware can't do this:

```
/login   → 10 requests per 15 min (strict — brute force protection)
/refresh → 30 requests per 15 min (lenient — automated browser refreshes)
```

The factory creates configured middleware instances:

```typescript
// Factory call — returns a middleware function
const loginLimiter = createRateLimiter({
    max: 10,
    windowSeconds: 900,
    keyPrefix: 'login',
});

// Another call — different config, different middleware
const refreshLimiter = createRateLimiter({
    max: 30,
    windowSeconds: 900,
    keyPrefix: 'refresh',
});
```

### How keyPrefix Prevents Cross-Contamination

Without separate prefixes:
```
Login attempt  → INCR ratelimit:192.168.1.42 → 1
Refresh attempt → INCR ratelimit:192.168.1.42 → 2  ← Counts against login!
```

With separate prefixes:
```
Login attempt   → INCR ratelimit:login:192.168.1.42   → 1 (independent counter)
Refresh attempt → INCR ratelimit:refresh:192.168.1.42 → 1 (independent counter)
```

---

## HTTP Response Headers

### On Normal Requests (Under Limit)

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 10              ← Max requests in this window
X-RateLimit-Remaining: 7           ← Requests left before hitting 429
X-RateLimit-Reset: 1741362900      ← Unix timestamp when window resets
```

These headers help API consumers build well-behaved clients. For example, a frontend could show:
> "3 login attempts remaining. Resets in 12 minutes."

### On Rate-Limited Requests (Over Limit)

```
HTTP/1.1 429 Too Many Requests
Retry-After: 547                   ← Seconds until the client can retry
Content-Type: application/json

{
    "message": "Too many login attempts. Please try again after 15 minutes.",
    "retryAfter": 547
}
```

**HTTP 429** is the standard status code for rate limiting:
- 400 = your request is malformed (fix the body)
- 401 = you're not authenticated (provide credentials)
- 403 = you're not authorized (insufficient permissions)
- 429 = your request is fine, but you're sending too many (slow down)

---

## Middleware Chaining in Express

```typescript
router.post('/login', loginRateLimiter, authController.login);
```

Express executes middleware left to right:

```
Request arrives
    │
    ▼
┌───────────────────┐
│ loginRateLimiter   │
│                   │
│ count ≤ 10?       │──YES──→ next() ──→ ┌─────────────────────┐
│                   │                     │ authController.login │
│ count > 10?       │──YES──→ res.429     │                     │
│ (stop, no next()) │                     │ Validates password,  │
└───────────────────┘                     │ generates tokens...  │
                                          └─────────────────────┘
```

**Key insight**: If the rate limiter rejects (sends 429), the controller **never runs**. No password comparison, no database query, no token generation. This saves server resources — rejected requests are cheap (1 Redis INCR + 1 Redis TTL).

---

## Graceful Degradation: Fail Open vs Fail Closed

When Redis is unavailable, the rate limiter can't check or increment counters. Two strategies:

### Fail Open (our choice)
```
Redis down → Allow all requests → Log warning
```
- Pros: Employees aren't blocked by a Redis hiccup
- Cons: Temporarily no rate limiting
- Best for: Internal platforms, non-critical services

### Fail Closed (alternative)
```
Redis down → Block all requests → Return 503
```
- Pros: Security never has a gap
- Cons: Redis outage = total service outage
- Best for: Public APIs handling payments, authentication for banks

We chose **fail open** because this is an internal platform. Blocking real employees because Redis restarted is worse than temporarily losing rate limits.

---

## Redis Key Design

```
┌────────────────────────────────────────────────────┐
│ Key: ratelimit:login:192.168.1.42                  │
│ Type: String (integer)                             │
│ Value: "7"                                         │
│ TTL: 542 seconds remaining                         │
│                                                    │
│ Key: ratelimit:refresh:192.168.1.42                │
│ Type: String (integer)                             │
│ Value: "3"                                         │
│ TTL: 891 seconds remaining                         │
└────────────────────────────────────────────────────┘
```

| Segment | Purpose |
|---|---|
| `ratelimit` | Namespace — separates from `rbac:*` and `auth:*` keys |
| `login` / `refresh` | Action — separate counters per endpoint |
| `192.168.1.42` | Identifier — separate counters per client IP |

---

## Comparing Rate Limiting Algorithms

| Algorithm | Redis Commands | Accuracy | Complexity |
|---|---|---|---|
| **Fixed Window** (ours) | INCR + EXPIRE | Good enough | Simple (2 commands) |
| Sliding Window Log | ZADD + ZRANGEBYSCORE + ZREMRANGEBYSCORE | Very accurate | Complex (sorted sets) |
| Sliding Window Counter | INCR + EXPIRE on two windows + math | Accurate | Medium |
| Token Bucket | HMSET + custom Lua script | Very flexible | Complex (Lua required) |

**Fixed window** has one edge case: a burst at the boundary.

```
Window 1: .......... ⑧ ⑨ ⑩   (last 3 requests at minute 14:58-15:00)
Window 2: ① ② ③ ④ ⑤ ..........  (5 requests at minute 15:00-15:02)
                     ↑
                     8 requests in 4 minutes (spanning two windows)
```

For login protection on an internal platform, this edge case is acceptable. Sliding window fixes it but adds significant complexity.

---

## Complete Redis Command Summary (All 6 Layers)

| Layer | Commands Used | Purpose |
|---|---|---|
| **1** | PING | Connection verification |
| **2** | SET, GET, MGET, DEL, Pipeline | Permission caching with batch operations |
| **3** | HSET, HGET, EXPIRE, SET, GET, SCAN, DEL | User context with hashes and pattern cleanup |
| **4** | PUBLISH, SUBSCRIBE | Cross-instance cache invalidation |
| **5** | SET, GET, DEL, SADD, SMEMBERS, SREM, Pipeline | Refresh token storage with sets |
| **6** | INCR, EXPIRE, TTL | Atomic counting for rate limiting |

You've now covered the core Redis command set used in real production systems.
