# Layer 4: Cache Invalidation with Pub/Sub

## The Problem

Layers 2 and 3 added Redis caching, but they introduced a **staleness window**:

```
2:00 PM — Admin removes Alice from Project X
2:00 PM — Redis still has: rbac:user:alice:project:X:role → "role-uuid"  (cached)
2:01 PM — Alice makes a request → gets permissions she shouldn't have!
2:10 PM — TTL expires → cache miss → DB query → correct "no role" result
```

For 10 minutes, Alice had stale permissions. For a security system, that's unacceptable.

**Also:** If you run multiple server instances behind a load balancer:

```
Instance A: Admin hits POST /system/reload-permissions → permissions refreshed ✓
Instance B: Still serving stale permissions from its cache ✗
Instance C: Still serving stale permissions from its cache ✗
```

Each instance has its own in-memory state. Reloading on one doesn't help the others.

## The Solution: Pub/Sub

Redis Pub/Sub is a real-time messaging system. When something changes, we **publish** an invalidation message. Every server instance that **subscribed** receives it instantly and clears its stale cache.

```
BEFORE: Change happens → wait for TTL to expire (minutes)
AFTER:  Change happens → PUBLISH message → all instances invalidate immediately (milliseconds)
```

TTLs still exist as a safety net, but Pub/Sub makes them almost never needed.

---

## 3 Redis Concepts Learned

### 1. PUBLISH / SUBSCRIBE

Pub/Sub is a **messaging pattern** built into Redis. It has two sides:

**SUBSCRIBE** — Start listening to a channel:
```
SUBSCRIBE rbac:invalidation
```
The client is now "tuned in." Every message published to this channel will be delivered to it.

**PUBLISH** — Send a message to a channel:
```
PUBLISH rbac:invalidation '{"type":"user_context","userId":"alice-uuid"}'
```
Returns the number of clients that received the message.

**How it flows:**

```
Instance A                    Redis Server                  Instance B
    │                              │                             │
    │── SUBSCRIBE ─────────────────│                             │
    │   rbac:invalidation          │                             │
    │                              │── SUBSCRIBE ────────────────│
    │                              │   rbac:invalidation         │
    │                              │                             │
    │   (admin adds a member)      │                             │
    │                              │                             │
    │── PUBLISH ───────────────────│                             │
    │   rbac:invalidation          │                             │
    │   {"type":"user_context",    │                             │
    │    "userId":"alice-uuid"}    │                             │
    │                              │                             │
    │◄── message delivered ────────│── message delivered ────────│
    │   (A receives its own msg!)  │   (B receives it too!)      │
    │                              │                             │
    │   invalidateUser("alice")    │   invalidateUser("alice")   │
```

**Key behaviors:**
- ALL subscribers receive every message (including the publisher itself)
- Messages go to a **channel**, not to specific clients
- Redis doesn't store messages — if nobody is subscribed, the message is lost
- Delivery is instant (sub-millisecond within Redis)

---

### 2. Dedicated Subscriber Connection (The Big "Gotcha")

This is the concept that surprises most people learning Redis Pub/Sub.

**The rule:** When a Redis client calls `SUBSCRIBE`, it enters **subscriber mode**. In this mode, the client can ONLY run:
- `SUBSCRIBE` / `UNSUBSCRIBE`
- `PSUBSCRIBE` / `PUNSUBSCRIBE` (pattern-based)
- `PING`

**Everything else is blocked:**
```typescript
// After calling subscriber.subscribe('rbac:invalidation'):
subscriber.get('some-key')     // ERROR: Connection in subscriber mode
subscriber.set('key', 'val')   // ERROR: Connection in subscriber mode
subscriber.mget(...)           // ERROR: Connection in subscriber mode
```

**Why does Redis do this?**

Redis uses a simple text protocol. Normally it's request-response:
```
Client: GET mykey
Server: "myvalue"

Client: SET foo bar
Server: OK
```

But in subscriber mode, Redis **pushes** messages to the client at any time:
```
Server: [message] rbac:invalidation {"type":"user_context","userId":"abc"}
Server: [message] rbac:invalidation {"type":"all_permissions"}
```

If you mixed both modes, the client wouldn't know: "Is this incoming data a response to my GET, or a Pub/Sub message?" The protocol would be ambiguous.

**So we need two separate Redis connections:**

```
┌──────────────────────────────────────────────────────┐
│  redis (from config/redis.ts) — the MAIN client      │
│                                                        │
│  Mode: Normal request-response                         │
│  Used for: GET, SET, MGET, PIPELINE, DEL, PUBLISH     │
│  Shared by: permission cache, user context cache       │
├──────────────────────────────────────────────────────┤
│  subscriber (created in cache-invalidation.ts)         │
│                                                        │
│  Mode: Subscriber (push messages only)                 │
│  Used for: SUBSCRIBE, listening for 'message' events   │
│  Purpose: Receive invalidation broadcasts              │
└──────────────────────────────────────────────────────┘
```

**Analogy:**
- Main client = your **phone** (make calls, send texts, browse the web — anything)
- Subscriber = a **walkie-talkie** tuned to one frequency (can only listen and talk on that frequency)

You can't browse the web on a walkie-talkie. You can't receive walkie-talkie broadcasts on your phone. Each has its dedicated purpose.

**Note:** `PUBLISH` does NOT require subscriber mode. It's a normal command, so the main client handles it. Only `SUBSCRIBE` (the listening side) requires the dedicated connection.

**ioredis-specific detail:** The subscriber client needs `maxRetriesPerRequest: null`. With a number (like `3` on the main client), ioredis throws errors for commands that "take too long" — but in subscriber mode, the client is perpetually waiting for messages, which ioredis would interpret as a stuck command. Setting `null` tells ioredis "this client intentionally waits forever."

---

### 3. Fire-and-Forget (Pub/Sub vs Message Queues)

Redis Pub/Sub is **fire-and-forget**: messages are delivered to whoever is listening **right now**. If nobody is subscribed, the message vanishes.

```
Scenario: All 3 server instances just restarted. None have called initCacheInvalidation() yet.

  PUBLISH rbac:invalidation '{"type":"user_context","userId":"abc"}'
  → Returns: 0 (zero receivers)
  → Message is gone. Nobody got it.
```

**Is this a problem?** No, because:

1. **TTLs are the safety net.** Even without Pub/Sub, stale cache expires within 5-10 minutes.
2. **Fresh restarts have empty caches.** If a server just restarted, there's no stale data to worry about — the cache will be filled fresh on the first request.
3. **Pub/Sub is an optimization, not a guarantee.** It makes invalidation instant instead of "within TTL."

**Comparison with message queues:**

| Feature | Redis Pub/Sub | Message Queue (RabbitMQ, Kafka) |
|---------|--------------|-------------------------------|
| **Delivery** | At-most-once (fire-and-forget) | At-least-once (persisted until consumed) |
| **Persistence** | Messages NOT stored | Messages stored on disk |
| **Offline consumers** | Miss the message | Get it when they reconnect |
| **Use case** | Cache invalidation, real-time notifications | Order processing, job queues, event sourcing |
| **Complexity** | Zero setup (built into Redis) | Separate infrastructure needed |

For cache invalidation, at-most-once is perfect. The worst case is a cache hit on stale data for a few minutes, which TTL handles. We don't need the complexity of a message queue.

---

## What Changed (Files)

### New: `src/rbac/cache-invalidation.ts`

Three exported functions:

| Function | Purpose | Redis Command | Which Client |
|----------|---------|--------------|-------------|
| `initCacheInvalidation()` | Creates subscriber, subscribes to channel, registers message handler | `SUBSCRIBE` | **Subscriber** (new connection) |
| `publishInvalidation(msg)` | Broadcasts a JSON message to all instances | `PUBLISH` | **Main** (from redis.ts) |
| `shutdownCacheInvalidation()` | Cleans up subscriber on shutdown | `UNSUBSCRIBE`, `QUIT` | **Subscriber** |

**Message handler dispatch (inside `initCacheInvalidation`):**

```
Message arrives on 'rbac:invalidation'
  │
  ├─ type === "all_permissions" or "role_permissions"
  │   → permissionCache.reload()          (Layer 2)
  │     1. DELs 'rbac:roles:loaded' flag
  │     2. Re-queries PostgreSQL
  │     3. Pipeline SETs fresh data to Redis
  │
  ├─ type === "user_context" (has userId)
  │   → userContextCache.invalidateUser(userId)   (Layer 3)
  │     1. SCANs for rbac:user:{userId}:*
  │     2. DELs all matching keys
  │     3. Next request → cache miss → fresh DB query
  │
  └─ unknown type → logs warning, ignores
```

### Modified: `src/server.ts`

Added `initCacheInvalidation()` call after permission cache loads:

```typescript
await permissionCache.ensureLoaded();

// Non-blocking — Pub/Sub failure doesn't prevent server startup
try {
    await initCacheInvalidation();
} catch (err) {
    console.warn('Cache invalidation Pub/Sub unavailable. Relying on TTL expiry.');
}

app.listen(Number(PORT), ...);
```

Same pattern as the Redis ping check — wrapped in its own try/catch. If Pub/Sub fails, the server still starts and relies on TTL expiry.

### Modified: `src/routes.ts`

The `/system/reload-permissions` endpoint now broadcasts after reloading:

```typescript
await permissionCache.reload();
await publishInvalidation({ type: 'all_permissions' });  // ← NEW: tell all instances
```

Before Layer 4, reloading on Instance A left B and C with stale data. Now all instances receive the message and reload.

### Modified: `src/modules/organizations/organizations.repository.ts`

`addMemberToOrganization()` now publishes after the DB insert:

```typescript
// DB insert succeeds...
await publishInvalidation({ type: 'user_context', userId });  // ← NEW
return result.rows[0];
```

### Modified: `src/modules/projects/projects.repository.ts`

Two functions now publish after their DB operations:

**`addMemberToProject()`:**
```typescript
// DB insert succeeds...
await publishInvalidation({ type: 'user_context', userId });  // ← NEW
return result.rows[0];
```

**`removeMemberFromProject()`:**
```typescript
// DB delete succeeds...
await publishInvalidation({ type: 'user_context', userId });  // ← NEW
return result.rows[0];
```

---

## How It All Flows (End to End)

### Scenario: Admin adds Alice to Project X

```
1. API: POST /projects/X/members { userId: "alice", roleId: "agent-role" }

2. projects.repository.ts → addMemberToProject():
   a. INSERT INTO members ... → success
   b. publishInvalidation({ type: 'user_context', userId: 'alice' })

3. publishInvalidation():
   a. JSON.stringify → '{"type":"user_context","userId":"alice"}'
   b. redis.publish('rbac:invalidation', payload)
   c. Redis delivers to ALL subscribers

4. EVERY server instance receives the message:
   a. Message handler parses JSON → type is "user_context"
   b. Calls userContextCache.invalidateUser('alice')
   c. SCAN rbac:user:alice:* → finds 3 keys (profile, org role, old project __NOT_FOUND__)
   d. DEL all 3 keys

5. Alice's next request:
   a. rbacMiddleware → userContextCache.getProjectRoleId('alice', 'X')
   b. Redis GET → null (cache miss — we just deleted it!)
   c. DB query → finds new role → caches it
   d. Alice now has correct permissions ✓
```

**Timeline:**
```
0ms    — Admin clicks "Add Member"
1ms    — DB INSERT completes
2ms    — PUBLISH sent to Redis
3ms    — All instances receive message
4ms    — SCAN + DEL completes on all instances
5ms    — Alice's cache is clean everywhere

vs. WITHOUT Pub/Sub:
0ms    — Admin clicks "Add Member"
1ms    — DB INSERT completes
...
600000ms (10 min) — TTL expires, cache finally refreshes
```

### Scenario: Admin reloads permissions

```
1. API: POST /system/reload-permissions

2. routes.ts:
   a. permissionCache.reload() → DEL flag → re-query DB → Pipeline SET fresh data
   b. publishInvalidation({ type: 'all_permissions' })

3. All instances receive "all_permissions" message:
   a. permissionCache.reload() called on each
   b. Each instance re-queries DB and writes fresh data to Redis + in-memory Map

4. All instances now have fresh permission mappings ✓
```

### Scenario: Redis is down

```
1. addMemberToProject() → DB INSERT succeeds
2. publishInvalidation() → redis.publish() throws → caught → warning logged
3. No Pub/Sub message sent
4. Other instances don't know about the change
5. BUT: TTL (10 min) will expire the stale cache eventually
6. App still works — just slightly delayed invalidation

This is acceptable because:
  - Redis being down is temporary
  - TTLs are the safety net
  - When Redis comes back, new changes will publish normally
```

---

## The Two Redis Connections (Visual Summary)

After Layer 4, the app uses **two** Redis connections:

```
┌─────────────────── Your Node.js Server ───────────────────┐
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Main Client (redis from config/redis.ts)            │   │
│  │                                                       │   │
│  │  Layer 1: redis.ping()                                │   │
│  │  Layer 2: redis.pipeline(), redis.mget()              │   │
│  │  Layer 3: redis.hget(), redis.get(), redis.set()      │   │
│  │  Layer 4: redis.publish()         ← PUBLISH works     │   │
│  │           redis.del()               on the main client │   │
│  └───────────────────────┬─────────────────────────────┘   │
│                          │ TCP connection #1                 │
│                          ▼                                   │
│                   ┌─────────────┐                           │
│                   │ Redis Server │                           │
│                   └─────────────┘                           │
│                          ▲                                   │
│                          │ TCP connection #2                 │
│  ┌───────────────────────┴─────────────────────────────┐   │
│  │  Subscriber Client (created in cache-invalidation.ts) │   │
│  │                                                       │   │
│  │  Layer 4: subscriber.subscribe('rbac:invalidation')   │   │
│  │           subscriber.on('message', handler)           │   │
│  │                                                       │   │
│  │  CANNOT do: get(), set(), mget(), pipeline()          │   │
│  │  (locked in subscriber mode)                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Channel and Message Design

**Channel:** `rbac:invalidation`

One channel for all invalidation types. Invalidation events are rare (a few per day), so a single channel keeps things simple.

**Messages (JSON):**

| Message | When Published | Handler Action |
|---------|---------------|----------------|
| `{ "type": "all_permissions" }` | Admin reloads permissions via API | `permissionCache.reload()` — re-query DB, Pipeline SET all roles |
| `{ "type": "role_permissions" }` | Alias for above | Same as `all_permissions` |
| `{ "type": "user_context", "userId": "uuid" }` | Member added/removed from org or project | `userContextCache.invalidateUser(userId)` — SCAN + DEL user keys |

---

## How Layers 1-4 Work Together Now

```
Layer 1: Redis connection setup (foundation)
    │
    ├── Layer 2: Permission cache (role → permissions in Redis)
    │     │
    │     └── getPermissions() → MGET from Redis (fast) or Map fallback (slow)
    │
    ├── Layer 3: User context cache (user → roles in Redis)
    │     │
    │     ├── getIsSystemAdmin() → HGET from Redis or DB fallback
    │     ├── getProjectRoleId() → GET from Redis or DB fallback
    │     └── getOrgRoleId()     → GET from Redis or DB fallback
    │
    └── Layer 4: Cache invalidation (THIS LAYER — glues it all together)
          │
          ├── SUBSCRIBE: listens for changes
          │     ├── "all_permissions" → Layer 2's permissionCache.reload()
          │     └── "user_context"   → Layer 3's userContextCache.invalidateUser()
          │
          └── PUBLISH: broadcasts changes (called from repositories and routes)
                ├── routes.ts: /system/reload-permissions → publish "all_permissions"
                ├── organizations.repository.ts: addMember → publish "user_context"
                └── projects.repository.ts: add/removeMember → publish "user_context"
```

**The complete request lifecycle after all 4 layers:**

```
Request → JWT auth → rbacMiddleware:
  1. getIsSystemAdmin(userId)    → Redis HGET (Layer 3, ~0.1ms)
  2. getProjectRoleId(userId, X) → Redis GET  (Layer 3, ~0.1ms)
  3. getOrgRoleId(userId, Y)     → Redis GET  (Layer 3, ~0.1ms)
  4. getPermissions([roleIds])   → Redis MGET (Layer 2, ~0.1ms)
→ Total auth overhead: ~0.4ms (vs ~6-15ms with 3 DB queries before)
→ If anything changes: Pub/Sub invalidates in ~5ms across all instances
→ If Redis is down: falls back to DB queries (same speed as before Layer 2)
```

---

## Verification Commands

```bash
# 1. Watch Pub/Sub messages live (in a separate terminal)
redis-cli SUBSCRIBE rbac:invalidation
# This terminal will show every published message in real-time

# 2. Start your server
npm run dev
# Console should show: [CacheInvalidation] Subscribed to 'rbac:invalidation'

# 3. Trigger a permission reload
curl -X POST http://localhost:3000/system/reload-permissions
# Terminal 1 shows: {"type":"all_permissions"}
# Server logs: [CacheInvalidation] Published to 'rbac:invalidation': ... (1 receivers)

# 4. Add a member via API (adjust URL/body to your routes)
curl -X POST http://localhost:3000/organizations/<orgId>/members \
  -H "Content-Type: application/json" \
  -d '{"userId":"<userId>","roleId":"<roleId>"}'
# Terminal 1 shows: {"type":"user_context","userId":"<userId>"}

# 5. Watch Redis commands during invalidation
redis-cli MONITOR
# After publishing, you'll see:
#   "publish" "rbac:invalidation" "{\"type\":\"user_context\",\"userId\":\"abc\"}"
#   "scan" "0" "MATCH" "rbac:user:abc:*" "COUNT" "100"
#   "del" "rbac:user:abc:profile" "rbac:user:abc:org:xyz:role"

# 6. Check subscriber count for the channel
redis-cli PUBSUB NUMSUB rbac:invalidation
# → "rbac:invalidation" "1"  (one subscriber = your server instance)

# 7. Multi-instance test:
# Start Instance A: PORT=3000 npm run dev
# Start Instance B: PORT=3001 npm run dev
# redis-cli PUBSUB NUMSUB rbac:invalidation → "2"
# Hit reload on Instance A:
curl -X POST http://localhost:3000/system/reload-permissions
# Both instances log: [CacheInvalidation] Reloading permissions (triggered by Pub/Sub)
```

---

## What's Next

- **Layer 5 (Refresh Token Migration):** Moves refresh tokens from PostgreSQL to Redis using `SET` with `EX` (auto-expiration) and `Sets` (`SADD/SMEMBERS/SREM`) for per-user token tracking.
- **Layer 6 (Rate Limiting):** Uses `INCR` (atomic increment) and `EXPIRE` to implement a fixed-window rate limiter — protecting login and API endpoints from abuse.
