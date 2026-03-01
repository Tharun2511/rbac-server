# Layer 5: Refresh Token Migration — Explanation

## What Changed

| Before (Layers 1-4) | After (Layer 5) |
|---|---|
| Refresh tokens stored ONLY in PostgreSQL | Stored in BOTH Redis and PostgreSQL (dual-write) |
| Every token validation = SQL JOIN query (~2-5ms) | Token validation = Redis GET (~0.1ms) + user lookup (~1ms) |
| Logout = 1 DELETE query | Logout = Redis SMEMBERS + Pipeline DEL + PostgreSQL DELETE |
| Redis was only a **cache** | Redis is now a **primary store** for token lookups |

### Files Created/Modified

| File | Change |
|---|---|
| `src/modules/auth/auth.redis-repository.ts` | **NEW** — Redis-backed token CRUD (4 functions) |
| `src/modules/auth/auth.repository.ts` | **MODIFIED** — Transformed into dual-write facade |
| `src/modules/auth/auth.service.ts` | **Unchanged** — imports still work via facade |
| `src/modules/auth/auth.controller.ts` | **Unchanged** — imports still work via facade |

---

## The Big Architectural Shift: Cache → Primary Store

### Layers 2-4: Redis as Cache
```
Client Request → App → Redis (cache)?
                         ├── HIT  → return cached data (fast)
                         └── MISS → PostgreSQL (source of truth) → cache result → return
```
Redis was optional. If Redis went down, the app just ran slower.

### Layer 5: Redis as Primary Store (Dual-Write)
```
WRITES:
  App → Redis (primary)  ← try/catch, log failure
      → PostgreSQL (backup) ← always, throws on failure

READS:
  App → Redis (try first)
         ├── HIT  → return (fast path)
         └── MISS → PostgreSQL (fallback, slow path)

DELETES:
  App → Redis (remove)   ← try/catch, log failure
      → PostgreSQL (remove) ← always
```

**Key difference**: Redis isn't just caching PostgreSQL data — it's the first place we write AND the first place we read. PostgreSQL is the durable backup, not the primary source.

---

## New Redis Concept: Sets

### What is a Redis Set?

A Set is an **unordered collection of unique strings** stored under one key.

```
┌─────────────────────────────────────────────┐
│ Key: auth:refresh:user:uuid-123             │
│                                             │
│ Members: { "abc123...", "def456...",         │
│            "ghi789..." }                    │
│                                             │
│ Properties:                                 │
│   • Unordered (no first/last)               │
│   • Unique (adding same value = no-op)      │
│   • O(1) add and remove                     │
│   • O(n) list all members                   │
└─────────────────────────────────────────────┘
```

### Set Commands Used

| Command | Syntax | What It Does | Time Complexity |
|---|---|---|---|
| **SADD** | `SADD key member` | Add a member to the set | O(1) |
| **SMEMBERS** | `SMEMBERS key` | Get ALL members of the set | O(n) |
| **SREM** | `SREM key member` | Remove one member from the set | O(1) |
| **DEL** | `DEL key` | Delete the entire set | O(1) |

### Why Sets? The Reverse Lookup Problem

When a user logs out, we need to delete ALL their refresh tokens.

**Forward lookup** (token → user) is easy:
```
GET auth:refresh:{tokenHash}  →  { userId: "uuid-123" }
```

But **reverse lookup** (user → all tokens) is the problem:
```
Without Sets:
  We'd need SCAN to find all keys matching auth:refresh:*
  Then check each one to see if userId matches
  → Slow, O(n) over ALL tokens in the system

With Sets:
  SMEMBERS auth:refresh:user:uuid-123
  → Returns ["abc123...", "def456..."] instantly
  → Only this user's tokens, not everyone's
```

The Set acts as a **reverse index** — it answers "what tokens belong to this user?" in O(n) where n is that user's token count (typically 1-3), not the system-wide token count.

---

## The Dual-Write Pattern Explained

### Why Not Redis-Only?

Redis stores everything in RAM. If Redis restarts:
- **Without persistence (RDB/AOF)**: All data is lost
- **With RDB snapshots**: Data since last snapshot is lost (could be minutes)
- **With AOF**: Minimal loss, but adds write overhead

Many production Redis setups run **without persistence** for cache instances. If we stored tokens only in Redis, a restart would log out every user instantly.

### Why Not PostgreSQL-Only (the old way)?

Every token refresh hits PostgreSQL with a JOIN query:
```sql
SELECT u.* FROM users u
JOIN refresh_tokens rt ON u.id = rt."userId"
WHERE rt.token = $1 AND rt."expiresAt" > NOW()
```
This is ~2-5ms per request. For a service handling thousands of refresh requests per second, that's significant database load.

### Dual-Write: Best of Both Worlds

```
                    ┌──────────────┐
                    │   WRITE      │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │    Redis     │  ← Fast write (in-memory)
                    │  try/catch   │  ← If fails, continue
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  PostgreSQL  │  ← Durable write (disk)
                    │   (always)   │  ← If fails, throw error
                    └──────────────┘


                    ┌──────────────┐
                    │    READ      │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
             ┌──YES─┤  Redis hit?  │
             │      └──────┬───────┘
             │             │ NO
             │      ┌──────▼───────┐
             │      │  PostgreSQL  │  ← Fallback
             │      └──────┬───────┘
             │             │
             ▼             ▼
         Return user    Return user
         (fast path)    (slow path)
```

| Scenario | What Happens |
|---|---|
| Normal operation | Redis serves reads, both stores stay in sync |
| Redis down on WRITE | Warning logged, PostgreSQL write succeeds |
| Redis down on READ | Falls back to PostgreSQL JOIN query |
| Redis restarts (data lost) | Reads fall back to PostgreSQL automatically |
| PostgreSQL down | App crashes (same behavior as before) |

---

## Redis Key Design

### Pattern 1: Forward Lookup (Token → User)

```
Key:    auth:refresh:{SHA256_hash_of_token}
Value:  '{"userId":"uuid-123","expiresAt":"2026-03-08T12:00:00Z"}'
TTL:    7 days (604800 seconds)
Type:   String (JSON)
```

**Why hash the token in the key?**

If someone gains read access to Redis (misconfigured ACL, debug tool, monitoring), they could see all keys. Using `auth:refresh:abc123raw` exposes the actual token. Using `auth:refresh:a1b2c3sha256...` only exposes the hash — useless without the original token.

### Pattern 2: Reverse Lookup (User → All Tokens)

```
Key:    auth:refresh:user:{userId}
Value:  Set { "hash1...", "hash2...", "hash3..." }
TTL:    7 days (604800 seconds)
Type:   Set
```

**Why EXPIRE on the Set?**

Without a TTL, the Set would accumulate hashes from expired tokens forever. Even though individual token keys expire (Pattern 1), the Set doesn't know they're gone. By setting the same 7-day TTL (refreshed on each new login), the Set auto-cleans itself.

---

## Operation Flows (Step by Step)

### Login Flow
```
1. User sends email + password
2. auth.service.ts generates:
   - Access token (JWT, 30 min)
   - Refresh token (80-char hex via crypto.randomBytes)
   - expiresAt = now + 7 days

3. auth.repository.ts (facade):

   Redis (auth.redis-repository.ts):
   ┌─────────────────────────────────────────────────────┐
   │ tokenHash = SHA256(refreshToken)                    │
   │                                                     │
   │ PIPELINE:                                           │
   │   SET auth:refresh:{hash} '{"userId":"..."}' EX 604800  │
   │   SADD auth:refresh:user:{userId} {hash}            │
   │   EXPIRE auth:refresh:user:{userId} 604800          │
   │ EXEC                                                │
   └─────────────────────────────────────────────────────┘

   PostgreSQL:
   ┌─────────────────────────────────────────────────────┐
   │ INSERT INTO refresh_tokens (token, userId, expiresAt)│
   │ VALUES ($1, $2, $3)                                 │
   └─────────────────────────────────────────────────────┘

4. Cookie set: refreshToken (httpOnly, secure, 7 days)
```

### Refresh Flow (Token Rotation)
```
1. Client sends cookie with current refresh token

2. FIND USER (Redis-first):
   ┌────────────────────────────────────────────┐
   │ tokenHash = SHA256(refreshToken)            │
   │ GET auth:refresh:{hash}                     │
   │   → Found? Parse JSON → get userId          │
   │   → findUserById(userId) from PostgreSQL    │
   │   → Not found? Fall back to PostgreSQL JOIN │
   └────────────────────────────────────────────┘

3. DELETE ALL OLD TOKENS (dual-delete):
   ┌────────────────────────────────────────────┐
   │ Redis:                                      │
   │   SMEMBERS auth:refresh:user:{userId}       │
   │   PIPELINE: DEL each hash key + DEL set     │
   │                                             │
   │ PostgreSQL:                                 │
   │   DELETE FROM refresh_tokens WHERE userId=$1│
   └────────────────────────────────────────────┘

4. STORE NEW TOKEN (dual-write):
   ┌────────────────────────────────────────────┐
   │ Same as Login Step 3 above                  │
   └────────────────────────────────────────────┘

5. New cookie set with new refresh token
```

### Logout Flow
```
1. User sends logout request (JWT identifies them)

2. DELETE ALL TOKENS (dual-delete):
   ┌────────────────────────────────────────────┐
   │ Redis:                                      │
   │   SMEMBERS auth:refresh:user:{userId}       │
   │   → Returns: ["hash1", "hash2"]             │
   │   PIPELINE:                                 │
   │     DEL auth:refresh:hash1                  │
   │     DEL auth:refresh:hash2                  │
   │     DEL auth:refresh:user:{userId}          │
   │   EXEC                                      │
   │                                             │
   │ PostgreSQL:                                 │
   │   DELETE FROM refresh_tokens WHERE userId=$1│
   └────────────────────────────────────────────┘

3. Cookie cleared
```

---

## Pipeline Usage in Layer 5

Pipelines appeared in Layer 2 (batch SET for permissions) and return in Layer 5 for token operations.

### Store Token — 3 Commands, 1 Round Trip
```
const pipe = redis.pipeline();
pipe.set(tokenKey, tokenData, 'EX', ttlSeconds);  // Store token data
pipe.sadd(userSetKey, tokenHash);                   // Add to user's Set
pipe.expire(userSetKey, ttlSeconds);                // Refresh Set TTL
await pipe.exec();                                  // Send all at once
```

Without Pipeline: 3 network round trips (~0.3ms each = ~0.9ms)
With Pipeline: 1 network round trip (~0.3ms total)

### Delete All User Tokens — N+1 Commands, 1 Round Trip
```
const tokenHashes = await redis.smembers(userSetKey);  // Get all hashes

const pipe = redis.pipeline();
for (const hash of tokenHashes) {
    pipe.del(`auth:refresh:${hash}`);  // Delete each token key
}
pipe.del(userSetKey);                  // Delete the Set itself
await pipe.exec();                     // Send all at once
```

Note: We can't Pipeline the SMEMBERS with the DELs because we need the SMEMBERS result to know WHICH keys to delete. This is a **sequential dependency** — SMEMBERS must finish before we can build the DEL commands.

---

## Comparing Set vs Other Redis Data Structures

| Structure | When to Use | Layer 5 Fit? |
|---|---|---|
| **String** | Single value per key | Yes — token → userId mapping |
| **Hash** | Multiple fields per key | No — only storing userId + expiresAt |
| **List** | Ordered, allows duplicates | No — tokens must be unique |
| **Set** | Unordered, unique members | Yes — user's token collection |
| **Sorted Set** | Ordered by score, unique | Overkill — we don't need ordering |

Sets are perfect because:
1. **Uniqueness**: Same token can't be added twice (idempotent SADD)
2. **O(1) add/remove**: Fast individual operations
3. **SMEMBERS**: Get all tokens for bulk delete on logout
4. **No ordering needed**: We don't care which token was created first

---

## Security Considerations

### Why Hash Tokens in Redis Keys?

```
BAD:  auth:refresh:a1b2c3d4e5f6...raw_token...
      ↑ Anyone who can LIST keys sees the actual token

GOOD: auth:refresh:e3b0c44298fc1c14...sha256_hash...
      ↑ Seeing the hash doesn't help — SHA256 is one-way
```

### Token Flow Security

```
Client                    Server                      Redis
  │                         │                           │
  │── raw token (cookie) ──→│                           │
  │                         │── SHA256(raw) → hash ────→│
  │                         │                           │── lookup by hash
  │                         │←── { userId } ────────────│
  │                         │                           │
  │←── new access token ────│                           │
```

The raw token exists in only two places:
1. The client's cookie (httpOnly, secure, strict sameSite)
2. The PostgreSQL backup (for fallback reads)

Redis only ever sees the hash — never the raw token.

---

## Graceful Degradation Summary

Layer 5 maintains the same philosophy as Layers 2-4:

```
Redis UP     → Fast path for all operations
Redis DOWN   → Everything still works via PostgreSQL fallback
Redis BACK   → New tokens go to Redis, old ones found via PostgreSQL
PostgreSQL DOWN → App crashes (unchanged — this is the source of truth)
```

Every Redis call in `auth.redis-repository.ts` is wrapped in try/catch. Failures are logged as warnings, never thrown. The facade in `auth.repository.ts` always runs the PostgreSQL operation regardless of Redis success/failure.
