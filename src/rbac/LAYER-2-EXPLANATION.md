# Layer 2: Permission Cache Migration (In-Memory → Redis)

## The Problem

Before Layer 2, the permission cache lived entirely in a JavaScript `Map` inside `permission-cache.ts`:

```
Server starts → query PostgreSQL → store in Map<roleId, Set<permissions>> → serve from Map
```

This had three limitations:

| Problem | Impact |
|---------|--------|
| **Doesn't survive restarts** | Every time you restart the server, it re-queries PostgreSQL to rebuild the Map |
| **Not shared across instances** | If you run 2 servers behind a load balancer, each loads independently — double the DB work |
| **No automatic expiry** | Data stays in the Map forever until someone manually calls `reload()` |

## The Solution

Add Redis as a shared, persistent cache layer between the app and PostgreSQL, while keeping the in-memory Map as a fallback.

```
BEFORE:  App → Map (in-memory)     → PostgreSQL (on miss/startup)
AFTER:   App → Redis (shared cache) → PostgreSQL (on miss/startup)
                ↓ (if Redis is down)
              Map (in-memory fallback)
```

---

## Redis Concepts Learned

### 1. Redis Stores Strings Only

Redis is a key-value store, but both keys AND values are **strings**. No objects, no arrays, no Sets.

To store a JavaScript `Set<string>` in Redis, you must serialize it:

```
JavaScript:     Set { "ticket.create", "ticket.view" }
       ↓ Array.from()
Array:          ["ticket.create", "ticket.view"]
       ↓ JSON.stringify()
Redis string:   '["ticket.create","ticket.view"]'
```

To read it back, reverse the process:

```
Redis string:   '["ticket.create","ticket.view"]'
       ↓ JSON.parse()
Array:          ["ticket.create", "ticket.view"]
       ↓ add to Set
JavaScript:     Set { "ticket.create", "ticket.view" }
```

**Gotcha:** `JSON.stringify(new Set(['a','b']))` returns `'{}'`, not `'["a","b"]'`. Sets aren't directly JSON-serializable — convert to Array first.

---

### 2. Key Naming Convention

Redis has no tables, schemas, or folders. Everything is one flat namespace. The community convention is **colon-separated namespaces**:

```
rbac:role:{roleId}:perms     →  permissions for a specific role
rbac:roles:loaded            →  flag: "have permissions been loaded?"
auth:refresh:{tokenHash}    →  (Layer 5) refresh token data
ratelimit:login:{ip}:{window} → (Layer 6) rate limit counter
```

**Why colons?**
- Tools like RedisInsight render them as a folder tree in the UI
- Makes pattern matching easy: `KEYS rbac:role:*` finds all role keys
- Prevents collisions: `rbac:role:123` won't clash with `auth:role:123`

---

### 3. TTL (Time-To-Live)

Every key gets a TTL of **3600 seconds (1 hour)**. Redis automatically deletes the key when it expires. No cron jobs, no cleanup code.

```typescript
redis.set('rbac:role:abc:perms', '["ticket.create"]', 'EX', 3600)
//                                                      ↑     ↑
//                                              "set Expiry"  seconds
```

**Why 1 hour?**
- Permissions rarely change (a few times per day at most)
- Too short (30s) = too many DB reloads, defeating the cache
- Too long (24h) = stale permissions if someone forgets to manually reload
- Layer 4 adds instant invalidation via Pub/Sub, so TTL is just a safety net

---

### 4. Pipeline (Batch Writes)

When loading permissions from PostgreSQL, we need to write N keys to Redis (one per role). Without Pipeline:

```
await redis.set(key1, val1, 'EX', 3600)   // network round trip 1
await redis.set(key2, val2, 'EX', 3600)   // network round trip 2
await redis.set(key3, val3, 'EX', 3600)   // network round trip 3
// 10 roles = 10 round trips = 10 × ~0.5ms = 5ms of pure network latency
```

With Pipeline:

```typescript
const pipe = redis.pipeline()
pipe.set(key1, val1, 'EX', 3600)   // queued locally (no network yet)
pipe.set(key2, val2, 'EX', 3600)   // queued locally
pipe.set(key3, val3, 'EX', 3600)   // queued locally
await pipe.exec()                   // ALL sent in ONE round trip!
// 10 roles = 1 round trip = ~0.5ms total
```

**Analogy:** Without pipeline = driving to the post office 10 times (one letter each trip). With pipeline = driving once with all 10 letters.

Pipeline queues commands in local memory, then sends them all at once when you call `exec()`. Redis processes them sequentially on its end, but the **network cost** is paid only once.

---

### 5. MGET (Batch Reads)

When a request needs permissions for 2 roles (e.g., org role + project role), we fetch both in one command:

```
Individual GETs:
  await redis.get('rbac:role:aaa:perms')   // round trip 1
  await redis.get('rbac:role:bbb:perms')   // round trip 2

MGET:
  await redis.mget('rbac:role:aaa:perms', 'rbac:role:bbb:perms')
  // 1 round trip → returns [value1, value2] in same order
```

**Pipeline vs MGET:**
- Pipeline batches **different** commands: SET + SET + DEL
- MGET batches the **same** command: GET + GET + GET (built into Redis as a native command)
- Both reduce round trips — use whichever fits

---

### 6. GET and DEL

**GET key** — Returns the string value, or `null` if the key doesn't exist (or its TTL expired).

Used in `_checkRedisLoaded()` to check the flag key:
```typescript
const value = await redis.get('rbac:roles:loaded')
// value is 'true' (string) or null
```

**DEL key** — Removes the key entirely. Returns `1` if deleted, `0` if it didn't exist.

Used in `reload()` to force a fresh load:
```typescript
await redis.del('rbac:roles:loaded')
// Next ensureLoaded() will see null → reload from DB
```

---

### 7. Graceful Degradation (Fallback)

Every Redis operation is wrapped in try/catch. If Redis is down, the code falls through to the in-memory Map — the app works exactly as it did before Layer 2, just without the Redis benefit.

```
getPermissions(roleIds) called
  │
  ├─ Try MGET from Redis
  │   ├─ All keys found → parse JSON, merge into Set, return       ← FAST PATH
  │   ├─ Some keys null → fall through to in-memory ↓
  │   └─ Redis error   → fall through to in-memory ↓
  │
  └─ Ensure in-memory Map is loaded (from DB if needed)
      └─ Read from Map, merge into Set, return                     ← SLOW PATH (still works)
```

**Principle from Layer 1:** Redis DOWN = slower app, NOT broken app.

---

## What Changed (Files)

### New: `src/rbac/redis-permission-cache.ts`

The full `RedisPermissionCache` class. Same public API as the original:

| Method | What it does | Redis commands used |
|--------|-------------|-------------------|
| `ensureLoaded()` | Loads permissions if not already loaded | `GET` (check flag) |
| `reload()` | Forces fresh load from PostgreSQL | `DEL` (remove flag) |
| `getPermissions(roleIds)` | Returns merged permission Set | `MGET` (batch read) |
| `hasPermission(roleIds, slug)` | Boolean check | delegates to `getPermissions` |
| `_writeToRedis()` (private) | Writes all roles to Redis | `Pipeline` of `SET` with `EX` |

### Modified: `src/rbac/permission-cache.ts`

The original 93-line class was replaced with a 1-line re-export:

```typescript
export { permissionCache } from './redis-permission-cache';
```

All 4 consumers keep importing from `permission-cache.ts` — they don't know the implementation changed. This is the **facade pattern**.

### Unchanged consumers:

- `src/server.ts` — `permissionCache.ensureLoaded()` at startup
- `src/middlewares/rbac.middleware.ts` — `permissionCache.getPermissions(roleIds)` per request
- `src/routes.ts` — `permissionCache.reload()` at reload endpoint
- `src/modules/auth/auth.service.ts` — `permissionCache.getPermissions(roleIds)` in getMyPermissions

---

## How Data Flows (Step by Step)

### Server Startup

```
1. server.ts calls permissionCache.ensureLoaded()
2. ensureLoaded() → _doLoad()
3.   Try: redis.get('rbac:roles:loaded')
4.     null (first boot) → continue to DB
5.   Query PostgreSQL: SELECT roleId, slug FROM role_permissions JOIN permissions
6.   Build in-memory Map<roleId, Set<slug>>
7.   Pipeline: SET rbac:role:{id}:perms for each role + SET rbac:roles:loaded
8.   pipe.exec() → all written to Redis in 1 round trip
9. Server is ready
```

### Second Instance Starts (Multi-Instance Benefit)

```
1. server.ts calls permissionCache.ensureLoaded()
2. ensureLoaded() → _doLoad()
3.   Try: redis.get('rbac:roles:loaded')
4.     'true' (Instance A already loaded!) → set isLoaded = true, RETURN
5.   *** No DB query at all ***
```

### Authenticated Request

```
1. rbacMiddleware resolves roleIds from DB (Layer 3 will cache this too)
2. Calls permissionCache.getPermissions([roleId1, roleId2])
3.   Build keys: ['rbac:role:{id1}:perms', 'rbac:role:{id2}:perms']
4.   redis.mget(key1, key2) → ['["ticket.create","ticket.view"]', '["ticket.assign"]']
5.   All found? Yes → JSON.parse each, merge into Set
6.   Return Set { "ticket.create", "ticket.view", "ticket.assign" }
7. requirePermission('ticket.create') → Set.has('ticket.create') → true → next()
```

### Redis Goes Down

```
1. Calls permissionCache.getPermissions([roleId1])
2.   redis.mget(...) → THROWS (connection error)
3.   catch → log warning
4.   Fall through to in-memory path
5.   ensureLoaded() → Map already populated → read from Map
6.   Return permissions from Map
7. App continues working (just can't benefit from Redis until it's back)
```

---

## Verification Commands

After starting the server with Redis running:

```bash
# See all permission keys in Redis
redis-cli KEYS "rbac:role:*"

# View permissions for a specific role (JSON array)
redis-cli GET "rbac:role:<paste-uuid-here>:perms"

# Check remaining TTL (should be ~3600, counting down)
redis-cli TTL "rbac:role:<paste-uuid-here>:perms"

# Check the loaded flag
redis-cli GET "rbac:roles:loaded"

# Watch all Redis commands in real-time (hit an API endpoint while this runs)
redis-cli MONITOR

# Test graceful degradation
docker stop redis          # stop Redis
curl http://localhost:3000/some-endpoint   # still works via in-memory fallback
docker start redis         # restart Redis
```

---

## What's Next

- **Layer 3 (User Context Cache):** Caches the 3 per-request DB queries (isSystemAdmin, project role, org role) so the `rbacMiddleware` hits Redis instead of PostgreSQL on every request.
- **Layer 4 (Cache Invalidation):** Adds Pub/Sub so when permissions change on one server instance, ALL instances invalidate their cache instantly (not waiting for TTL expiry).
