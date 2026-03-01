# Layer 3: User Context Caching

## The Problem

Every authenticated request runs the RBAC middleware, which fires **2-3 PostgreSQL queries** before your actual business logic even starts:

```
Request hits /api/tickets
  → authMiddleware: verify JWT (fast, no DB)
  → rbacMiddleware:
      Query 1: SELECT "isSystemAdmin" FROM users WHERE id=$1           ← EVERY request
      Query 2: SELECT "roleId" FROM members WHERE userId=$1 AND projectId=$2   ← if project header
      Query 3: SELECT "roleId" FROM members WHERE userId=$1 AND orgId=$2       ← if org header
  → your actual ticket handler (finally!)
```

The same 3 queries were **duplicated** in `auth.service.ts → getMyPermissions()` (the GET /auth/permissions endpoint). So the exact same data was being fetched from PostgreSQL multiple times across different code paths.

At 100 requests/second, that's 200-300 DB queries/second **just for permission checks** — before any actual work happens.

## The Solution

Replace those DB queries with Redis lookups. On a cache hit (~0.1ms), the DB is never touched. On a cache miss, query the DB once, store the result in Redis, and all subsequent requests are instant.

```
BEFORE (every request):
  App  ──SQL──>  PostgreSQL  ──result──>  App     (2-5ms per query)

AFTER (cache hit):
  App  ──GET──>  Redis  ──result──>  App           (0.1ms)

AFTER (cache miss — first request only):
  App  ──GET──>  Redis  ──null──>  App
  App  ──SQL──>  PostgreSQL  ──result──>  App
  App  ──SET──>  Redis                              (cached for next time)
```

---

## 5 Redis Concepts Learned

### 1. Hashes (HSET / HGET)

In Layer 2, we used Redis **Strings** — one value per key. A Hash stores **multiple field-value pairs** under a single key. Think of it as a mini database row.

```
Using Strings (3 separate keys):
  rbac:user:123:isSystemAdmin  →  "true"
  rbac:user:123:name           →  "Alice"
  rbac:user:123:email          →  "a@b.com"
  → 3 keys, each needs its own TTL

Using a Hash (1 key, multiple fields):
  rbac:user:123:profile  →  {
    isSystemAdmin: "true",
    name: "Alice",
    email: "a@b.com"
  }
  → 1 key, 1 TTL, logically grouped
```

**Commands:**

| Command | What it does | Example |
|---------|-------------|---------|
| `HSET key field value` | Set one field | `HSET rbac:user:123:profile isSystemAdmin "true"` |
| `HGET key field` | Get one field | `HGET rbac:user:123:profile isSystemAdmin` → `"true"` |
| `HGETALL key` | Get all fields | `HGETALL rbac:user:123:profile` → `{isSystemAdmin: "true", ...}` |
| `HDEL key field` | Delete one field | `HDEL rbac:user:123:profile isSystemAdmin` |

**Why Hash for user profile?**
Right now we only store `isSystemAdmin`, so a plain String would work. But Hashes let us add more profile fields later (email, name, isActive) without creating new keys or new TTL management. The structure is already there to grow.

**One catch:** Unlike `SET key value EX 300`, there's no `HSET key field value EX 300`. You need a separate `EXPIRE` command for TTL. We use a Pipeline to send both in one round trip:

```typescript
const pipe = redis.pipeline();
pipe.hset(key, 'isSystemAdmin', 'true');   // set the field
pipe.expire(key, 300);                      // set TTL on the whole key
await pipe.exec();                          // both sent at once
```

---

### 2. Cache-Aside Pattern

Every function in `user-context-cache.ts` follows the same 5-step pattern called **cache-aside** (also known as "lazy loading"):

```
┌──────────────┐      ┌───────┐      ┌────────────┐
│  Application │──1──>│ Redis │      │ PostgreSQL │
│              │<──2──│       │      │            │
│  (cache hit) │      └───────┘      │            │
│              │                      │            │
│  (cache miss)│                      │            │
│              │──────────3─────────>│            │
│              │<─────────4─────────│            │
│              │──5──>│ Redis │      │            │
└──────────────┘      └───────┘      └────────────┘

Step 1: Ask Redis for data         (GET / HGET)
Step 2: Redis returns value or null (hit or miss)
Step 3: On miss → query PostgreSQL  (SELECT ...)
Step 4: PostgreSQL returns data
Step 5: Write data to Redis + TTL   (SET / HSET + EXPIRE)
```

**Why "cache-aside" and not other patterns?**

| Pattern | How it works | Why we didn't use it |
|---------|-------------|---------------------|
| **Cache-aside** (ours) | App manages everything: reads cache, queries DB on miss, fills cache | Simple, full control, graceful degradation is trivial |
| **Write-through** | App writes to cache AND DB at the same time | More complex, requires write coordination |
| **Write-behind** | App writes to cache only, cache syncs to DB asynchronously | Risk of data loss if cache dies before sync |
| **Read-through** | Cache itself queries DB on miss (no app involvement) | Requires special cache middleware/proxy |

Cache-aside is the most common pattern because:
- The application has full control (easy to debug)
- If Redis is down, just skip steps 1 and 5 — the app still works via direct DB queries
- No special Redis modules or infrastructure needed

---

### 3. Negative Caching

**The problem it solves:**

User "alice" is **not** a member of project "xyz". Without negative caching:

```
Request 1: Redis GET → null (miss) → DB query → 0 rows → nothing to cache
Request 2: Redis GET → null (miss) → DB query → 0 rows → nothing to cache
Request 3: Redis GET → null (miss) → DB query → 0 rows → nothing to cache
              ↑ Every request hits the DB for a result that won't change!
```

With negative caching — we store a special sentinel value `__NOT_FOUND__`:

```
Request 1: Redis GET → null (miss) → DB query → 0 rows → SET "__NOT_FOUND__" in Redis
Request 2: Redis GET → "__NOT_FOUND__" (hit!) → return null immediately
Request 3: Redis GET → "__NOT_FOUND__" (hit!) → return null immediately
              ↑ DB only hit ONCE. Redis handles all subsequent checks.
```

**How it works in code:**

```typescript
// Writing to cache:
const valueToCache = roleId ?? NOT_FOUND_SENTINEL;  // null becomes "__NOT_FOUND__"
await redis.set(key, valueToCache, 'EX', 600);

// Reading from cache:
const cached = await redis.get(key);
if (cached === NOT_FOUND_SENTINEL) return null;   // we checked before, nothing there
if (cached !== null) return cached;                 // actual roleId
// cached is null → true cache miss → query DB
```

**Why `__NOT_FOUND__` and not an empty string `""`?**
An empty string could theoretically be valid in some other context. Double underscores are a convention meaning "system-internal value." No UUID would ever equal `__NOT_FOUND__`.

**Safety net:** The TTL (10 minutes) ensures the sentinel expires. If the user IS added to the project later, the stale `__NOT_FOUND__` will expire within 10 minutes. Layer 4 adds instant invalidation.

---

### 4. Composite Key Design

In Layer 2, keys had **one variable**:
```
rbac:role:{roleId}:perms
          ^^^^^^^^
          one dimension
```

In Layer 3, keys encode **multiple variables** (like a compound index in SQL):
```
rbac:user:{userId}:project:{projectId}:role
          ^^^^^^^^          ^^^^^^^^^^^
          two dimensions
```

This lets Redis answer multi-dimensional lookups: "What role does user X have in project Y?"

**Full key inventory for Layer 3:**

```
rbac:user:{userId}:profile                    → Hash { isSystemAdmin: "true" }
rbac:user:{userId}:org:{orgId}:role           → roleId or "__NOT_FOUND__"
rbac:user:{userId}:project:{projectId}:role   → roleId or "__NOT_FOUND__"
rbac:roles:system-role-id                     → roleId (singleton, rarely changes)
```

**Why not one big hash per user with all their roles?**
Because Redis TTL applies to the **entire key**, not individual fields. A user's profile (5 min TTL) and their project role (10 min TTL) need different expiration times. Separate keys = separate TTLs.

Also, invalidating one project role (user removed from project A) shouldn't affect the org role cache. Separate keys = surgical invalidation.

---

### 5. SCAN + DEL (Safe Pattern Deletion)

When a user's roles change, we need to delete **all** their cached keys. The pattern is `rbac:user:{userId}:*` — but how do we find keys by pattern?

**`KEYS` command (the dangerous way):**
```
KEYS rbac:user:123:*
```
- Scans the **entire keyspace** in one blocking operation
- While scanning, Redis can't serve ANY other commands
- With 1 million keys, this can freeze Redis for seconds
- Fine for `redis-cli` debugging, **terrible for application code**

**`SCAN` command (the safe way):**
```
SCAN 0 MATCH rbac:user:123:* COUNT 100     → returns [cursor: 42, keys: [key1, key2]]
SCAN 42 MATCH rbac:user:123:* COUNT 100    → returns [cursor: 0, keys: [key3]]
                                              (cursor 0 = done scanning)
```
- Scans in **small batches** (~100 keys per call)
- Between batches, Redis serves other commands normally
- Uses a cursor number to track progress
- Guaranteed to eventually visit all keys

**Analogy:**
- `KEYS` = closing the library for a full inventory (nobody can enter)
- `SCAN` = checking one shelf at a time while the library stays open

**ioredis simplifies this** with `scanStream()`:
```typescript
const stream = redis.scanStream({ match: 'rbac:user:123:*', count: 100 });
const keysToDelete: string[] = [];
stream.on('data', (keys) => keysToDelete.push(...keys));
stream.on('end', () => {
    if (keysToDelete.length > 0) redis.del(...keysToDelete);
});
```

---

## What Changed (Files)

### New: `src/rbac/user-context-cache.ts`

| Method | Purpose | Redis Commands | TTL |
|--------|---------|---------------|-----|
| `getIsSystemAdmin(userId)` | Check if user is system admin | `HGET` / `HSET` + `EXPIRE` | 5 min |
| `getSystemRoleId()` | Get the SYSTEM role UUID | `GET` / `SET ... EX` | 1 hour |
| `getProjectRoleId(userId, projectId)` | Get user's role in a project | `GET` / `SET ... EX` (with sentinel) | 10 min |
| `getOrgRoleId(userId, orgId)` | Get user's role in an org | `GET` / `SET ... EX` (with sentinel) | 10 min |
| `invalidateUser(userId)` | Delete all cached data for a user | `SCAN` + `DEL` | — |

### Modified: `src/middlewares/rbac.middleware.ts`

The structure is **identical** — only the data source changed:

| Before (DB query) | After (cache call) |
|---|---|
| `db.query('SELECT "isSystemAdmin" FROM users...')` | `userContextCache.getIsSystemAdmin(userId)` |
| `db.query("SELECT id FROM roles WHERE scope='SYSTEM'...")` | `userContextCache.getSystemRoleId()` |
| `db.query('SELECT "roleId" FROM members...projectId')` | `userContextCache.getProjectRoleId(userId, projectId)` |
| `db.query('SELECT "roleId" FROM members...orgId')` | `userContextCache.getOrgRoleId(userId, orgId)` |

The `db` import was **removed** — the middleware no longer talks to PostgreSQL at all.

### Modified: `src/modules/auth/auth.service.ts`

Same 4 replacements in the `getMyPermissions()` function. The `db` import stays because other functions (`login`, `getMyContexts`) still use it.

---

## How a Request Flows Now (End to End)

### First request (cold cache):

```
1. JWT validated → userId extracted
2. rbacMiddleware:
   a. userContextCache.getIsSystemAdmin(userId)
      → HGET rbac:user:abc:profile isSystemAdmin → null (MISS)
      → SELECT "isSystemAdmin" FROM users WHERE id='abc' → false
      → HSET rbac:user:abc:profile isSystemAdmin "false" + EXPIRE 300
      → return false

   b. userContextCache.getProjectRoleId(userId, projectId)
      → GET rbac:user:abc:project:xyz:role → null (MISS)
      → SELECT "roleId" FROM members WHERE userId='abc' AND projectId='xyz' → 'role-uuid-1'
      → SET rbac:user:abc:project:xyz:role 'role-uuid-1' EX 600
      → return 'role-uuid-1'

   c. userContextCache.getOrgRoleId(userId, orgId)
      → GET rbac:user:abc:org:org1:role → null (MISS)
      → SELECT "roleId" FROM members WHERE userId='abc' AND orgId='org1' AND projectId IS NULL → 'role-uuid-2'
      → SET rbac:user:abc:org:org1:role 'role-uuid-2' EX 600
      → return 'role-uuid-2'

   d. permissionCache.getPermissions(['role-uuid-1', 'role-uuid-2'])
      → MGET (from Layer 2) → merged permission Set

3. Business logic runs with req.permissions populated
```

**Redis MONITOR output during first request:**
```
"HGET" "rbac:user:abc:profile" "isSystemAdmin"
"HSET" "rbac:user:abc:profile" "isSystemAdmin" "false"
"EXPIRE" "rbac:user:abc:profile" "300"
"GET" "rbac:user:abc:project:xyz:role"
"SET" "rbac:user:abc:project:xyz:role" "role-uuid-1" "EX" "600"
"GET" "rbac:user:abc:org:org1:role"
"SET" "rbac:user:abc:org:org1:role" "role-uuid-2" "EX" "600"
"MGET" "rbac:role:role-uuid-1:perms" "rbac:role:role-uuid-2:perms"
```

### Second request (warm cache — the goal):

```
1. JWT validated → userId extracted
2. rbacMiddleware:
   a. HGET rbac:user:abc:profile isSystemAdmin → "false" (HIT) → return false
   b. GET rbac:user:abc:project:xyz:role → "role-uuid-1" (HIT) → return 'role-uuid-1'
   c. GET rbac:user:abc:org:org1:role → "role-uuid-2" (HIT) → return 'role-uuid-2'
   d. MGET for permissions → (HIT from Layer 2)

3. Business logic runs — ZERO DB queries for auth!
```

**Redis MONITOR output — just 4 fast reads:**
```
"HGET" "rbac:user:abc:profile" "isSystemAdmin"
"GET" "rbac:user:abc:project:xyz:role"
"GET" "rbac:user:abc:org:org1:role"
"MGET" "rbac:role:role-uuid-1:perms" "rbac:role:role-uuid-2:perms"
```

### Non-member request (negative caching in action):

```
User "bob" is NOT a member of project "xyz"

Request 1:
  GET rbac:user:bob:project:xyz:role → null (MISS)
  SELECT "roleId" FROM members... → 0 rows
  SET rbac:user:bob:project:xyz:role "__NOT_FOUND__" EX 600    ← negative cache!

Request 2:
  GET rbac:user:bob:project:xyz:role → "__NOT_FOUND__" (HIT)
  return null immediately (no DB query!)
```

### Redis goes down:

```
1. userContextCache.getIsSystemAdmin(userId)
   → HGET throws error → caught in try/catch → warning logged
   → Falls through to: SELECT "isSystemAdmin" FROM users WHERE id=$1
   → Returns result from DB (no caching, but works)

2-3. Same pattern for role lookups

Result: App works, just slower (same as before Layer 3)
```

---

## TTL Strategy

| Data | Key | TTL | Why |
|------|-----|-----|-----|
| User profile (isSystemAdmin) | `rbac:user:{id}:profile` | **5 min** | Security-critical. If admin status is revoked, propagates within 5 min max. |
| Project role | `rbac:user:{id}:project:{pid}:role` | **10 min** | Changes less often. 10 min balances freshness vs cache hit rate. |
| Org role | `rbac:user:{id}:org:{oid}:role` | **10 min** | Same reasoning as project role. |
| System role ID | `rbac:roles:system-role-id` | **1 hour** | Seed data UUID that never changes. Cache aggressively. |

**Layer 4 will add instant invalidation** via Pub/Sub, so TTLs become a safety net rather than the primary freshness mechanism.

---

## Verification Commands

```bash
# After logging in and hitting a protected endpoint:

# 1. Check the user profile hash
redis-cli HGETALL "rbac:user:<userId>:profile"
# → 1) "isSystemAdmin"
# → 2) "false"

# 2. Check a project role
redis-cli GET "rbac:user:<userId>:project:<projectId>:role"
# → "role-uuid-here" or "__NOT_FOUND__"

# 3. Check an org role
redis-cli GET "rbac:user:<userId>:org:<orgId>:role"
# → "role-uuid-here" or "__NOT_FOUND__"

# 4. Check TTLs
redis-cli TTL "rbac:user:<userId>:profile"
# → ~300 (5 min, counting down)

redis-cli TTL "rbac:user:<userId>:project:<projectId>:role"
# → ~600 (10 min, counting down)

# 5. See all keys for a user
redis-cli KEYS "rbac:user:<userId>:*"
# → lists profile, org role, project role keys

# 6. Watch live
redis-cli MONITOR
# → hit API → see HGET, GET commands (hits) or HGET + HSET (misses)

# 7. Test invalidation
# (Will be wired up in Layer 4, but you can call it manually in code)
# userContextCache.invalidateUser(userId) → SCAN + DEL

# 8. Test graceful degradation
docker stop redis
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/...
# → Still works (falls back to DB queries)
```

---

## What's Next

- **Layer 4 (Cache Invalidation with Pub/Sub):** When an admin adds/removes a member or reloads permissions, Layer 4 publishes an invalidation message via Redis Pub/Sub. All server instances receive it and call `invalidateUser()` or `permissionCache.reload()` instantly — no waiting for TTL expiry.
- The `invalidateUser()` method we built in this layer is already ready for Layer 4 to call.
