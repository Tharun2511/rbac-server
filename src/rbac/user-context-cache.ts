// ═══════════════════════════════════════════════════════════════════════════════
// src/rbac/user-context-cache.ts — User Context Cache (Redis-backed)
// ═══════════════════════════════════════════════════════════════════════════════
//
// LAYER 3: Caches the per-request DB queries that the RBAC middleware runs.
//
// WHAT THIS FILE TEACHES:
//   1. Hashes (HSET/HGET) — Store multiple fields under one key (like a DB row)
//   2. Cache-Aside Pattern — Check cache → miss → query DB → fill cache → return
//   3. Negative Caching    — Cache "not found" results to avoid repeated DB misses
//   4. Composite Keys      — Encode multiple dimensions (user + project) into one key
//   5. SCAN + DEL          — Safely find and delete keys by pattern
//
// THE PROBLEM:
//   Every authenticated request runs 2-3 DB queries BEFORE business logic:
//
//     rbacMiddleware:
//       Query 1: SELECT "isSystemAdmin" FROM users WHERE id=$1           (EVERY request)
//       Query 2: SELECT "roleId" FROM members WHERE userId=$1 AND projectId=$2   (if project)
//       Query 3: SELECT "roleId" FROM members WHERE userId=$1 AND orgId=$2       (if org)
//
//   For 100 requests/second, that's 200-300 DB queries/second just for auth checks.
//
// THE SOLUTION:
//   Cache these results in Redis. On cache hit (sub-millisecond), skip the DB entirely.
//   On cache miss, query DB once, cache the result, and subsequent requests are fast.
//
// ═══════════════════════════════════════════════════════════════════════════════

import { redis } from '../config/redis';
import { db } from '../config/db';

// ─── KEY PATTERNS ───────────────────────────────────────────────────────────
//
// COMPOSITE KEY DESIGN:
//   In Layer 2, keys had one variable: rbac:role:{roleId}:perms
//   In Layer 3, keys encode MULTIPLE variables:
//
//     rbac:user:{userId}:profile                    ← one variable (userId)
//     rbac:user:{userId}:org:{orgId}:role           ← two variables (userId + orgId)
//     rbac:user:{userId}:project:{projectId}:role   ← two variables (userId + projectId)
//
//   This "composite key" pattern is like a compound index in SQL.
//   The key itself encodes the query parameters, so Redis can look up
//   "what role does user X have in project Y?" in one GET.
//
//   WHY NOT one big hash per user with all their roles?
//     Because different role assignments need different TTLs, and Redis
//     TTL applies to the entire key, not individual hash fields.
//     Also, invalidating one project role shouldn't affect the org role cache.
//

// ─── NEGATIVE CACHE SENTINEL ────────────────────────────────────────────────
//
// PROBLEM:
//   User "alice" is NOT a member of project "xyz".
//   Without negative caching:
//     Request 1: Redis GET → null (miss) → DB query → 0 rows → nothing to cache
//     Request 2: Redis GET → null (miss) → DB query → 0 rows → nothing to cache
//     Request 3: Redis GET → null (miss) → DB query → 0 rows → nothing to cache
//     ...every request hits the DB for a result that won't change!
//
//   With negative caching:
//     Request 1: Redis GET → null (miss) → DB query → 0 rows → SET "__NOT_FOUND__" in Redis
//     Request 2: Redis GET → "__NOT_FOUND__" (hit!) → return null immediately
//     Request 3: Redis GET → "__NOT_FOUND__" (hit!) → return null immediately
//     ...DB is only hit ONCE, then Redis handles all subsequent checks.
//
// WHY "__NOT_FOUND__" AND NOT empty string ""?
//   An empty string could theoretically be a valid value in some contexts.
//   "__NOT_FOUND__" is clearly a sentinel — no UUID or role ID would ever equal this.
//   The double underscores are a convention meaning "this is a system-internal value."
//
const NOT_FOUND_SENTINEL = '__NOT_FOUND__';

// ─── TTL VALUES ─────────────────────────────────────────────────────────────
//
// WHY DIFFERENT TTLs FOR DIFFERENT DATA?
//
//   Profile (isSystemAdmin) → 5 minutes:
//     This controls whether someone has GOD MODE (full system access).
//     If an admin revokes system admin status, we want it to take effect
//     within 5 minutes max, not 1 hour. Security-critical = shorter TTL.
//
//   Role mappings → 10 minutes:
//     "What role does user X have in project Y?" changes less frequently
//     (only when an admin adds/removes members). 10 minutes is a good balance
//     between freshness and cache hit rate.
//
//   System role ID → 1 hour:
//     The SYSTEM role ID literally never changes (it's a seed data UUID).
//     Cache it aggressively. 1 hour is fine.
//
const PROFILE_TTL = 300;       // 5 minutes
const ROLE_TTL = 600;          // 10 minutes
const SYSTEM_ROLE_TTL = 3600;  // 1 hour

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE-ASIDE PATTERN (the core concept of this entire file)
// ═══════════════════════════════════════════════════════════════════════════════
//
// "Cache-aside" means the APPLICATION manages the cache, not the database.
// The app decides when to read from cache, when to query DB, and when to fill cache.
//
// Every function in this file follows the SAME 5-step pattern:
//
//   ┌──────────────┐      ┌───────┐      ┌────────────┐
//   │  Application │─1──▶│ Redis │      │ PostgreSQL │
//   │              │◀─2──│       │      │            │
//   │   (cache hit)│      └───────┘      │            │
//   │              │                      │            │
//   │   (cache miss)                      │            │
//   │              │─────────3──────────▶│            │
//   │              │◀────────4──────────│            │
//   │              │─5──▶│ Redis │      │            │
//   └──────────────┘      └───────┘      └────────────┘
//
//   Step 1: App asks Redis for the data        (GET / HGET)
//   Step 2: Redis returns value or null         (hit or miss)
//   Step 3: On miss → App queries PostgreSQL    (SELECT ...)
//   Step 4: PostgreSQL returns the data
//   Step 5: App writes data to Redis with TTL   (SET / HSET + EXPIRE)
//
// OTHER CACHING PATTERNS (for comparison):
//   - "Write-through": App writes to cache AND DB at the same time
//   - "Write-behind":  App writes to cache, cache asynchronously syncs to DB
//   - "Read-through":  Cache itself queries DB on miss (requires cache middleware)
//
// Cache-aside is the simplest and most common. We use it because:
//   - The app has full control (easier to debug)
//   - No special Redis modules needed
//   - Graceful degradation is trivial (skip step 1 and 5 if Redis is down)
//
// ═══════════════════════════════════════════════════════════════════════════════

class UserContextCache {

    // ─── getIsSystemAdmin() ─────────────────────────────────────────────
    //
    // Checks if a user is a System Admin. Cached in a Redis Hash.
    //
    // REDIS HASHES — A NEW DATA STRUCTURE:
    //
    //   So far (Layer 2), we only used Redis Strings (SET/GET).
    //   A String stores ONE value per key.
    //
    //   A Hash stores MULTIPLE field-value pairs under ONE key.
    //   Think of it as a mini database row:
    //
    //     String:  rbac:user:123:isSystemAdmin → "true"      (1 key = 1 field)
    //              rbac:user:123:name          → "Alice"     (another key = another field)
    //              rbac:user:123:email         → "a@b.com"   (yet another key)
    //              → 3 keys, each with its own TTL to manage
    //
    //     Hash:    rbac:user:123:profile → {
    //                isSystemAdmin: "true",
    //                name: "Alice",
    //                email: "a@b.com"
    //              }
    //              → 1 key, 1 TTL, all fields grouped logically
    //
    //   COMMANDS:
    //     HSET key field value  — Set one field in the hash
    //     HGET key field        — Get one field from the hash
    //     HGETALL key           — Get ALL fields (returns object)
    //     HDEL key field        — Delete one field
    //
    //   Right now we only store isSystemAdmin, but the Hash structure
    //   lets us add more profile fields later without creating new keys.
    //
    async getIsSystemAdmin(userId: string): Promise<boolean> {
        const key = `rbac:user:${userId}:profile`;

        // ── Step 1: Check Redis (HGET) ──────────────────────────────────
        try {
            const cached = await redis.hget(key, 'isSystemAdmin');

            // ── Step 2: Cache hit → return immediately ──────────────────
            //
            // HGET returns:
            //   - The field value as a string (e.g., "true" or "false")
            //   - null if the key doesn't exist OR the field doesn't exist
            //
            // Redis doesn't have booleans, so we store "true"/"false" strings
            // and compare here.
            //
            if (cached !== null) {
                return cached === 'true';
            }
        } catch (err) {
            // Redis down — fall through to DB
            console.warn('[UserContextCache] HGET failed for isSystemAdmin:', (err as Error).message);
        }

        // ── Step 3: Cache miss → Query PostgreSQL ───────────────────────
        const result = await db.query(
            'SELECT "isSystemAdmin" FROM users WHERE id = $1',
            [userId]
        );
        const isSystemAdmin: boolean = result.rows[0]?.isSystemAdmin ?? false;

        // ── Step 5: Fill cache (HSET + EXPIRE) ─────────────────────────
        //
        // TWO commands needed for Hashes:
        //   HSET sets the field value (but doesn't set TTL on its own)
        //   EXPIRE sets the TTL on the entire key
        //
        // With plain Strings, SET can do both: SET key value EX 300
        // With Hashes, there's no "HSET key field value EX 300" — you need
        // a separate EXPIRE call. We use pipeline to send both in one round trip.
        //
        // WHY NOT store "true"/"false" as a plain String with SET?
        //   We COULD. But Hash gives us room to grow. If Layer 5 or later
        //   needs to cache more user fields (email, name, isActive), we just
        //   add more HSET calls to the same key. No new key patterns needed.
        //
        try {
            const pipe = redis.pipeline();
            pipe.hset(key, 'isSystemAdmin', isSystemAdmin.toString());
            pipe.expire(key, PROFILE_TTL);
            await pipe.exec();
        } catch (err) {
            console.warn('[UserContextCache] Failed to cache isSystemAdmin:', (err as Error).message);
        }

        return isSystemAdmin;
    }

    // ─── getSystemRoleId() ──────────────────────────────────────────────
    //
    // Gets the SYSTEM-scoped role ID. This is a seed data UUID that
    // never changes, so we cache it aggressively (1 hour TTL).
    //
    // This replaces: db.query("SELECT id FROM roles WHERE scope = 'SYSTEM' LIMIT 1")
    // which was called every time a system admin made a request.
    //
    async getSystemRoleId(): Promise<string | null> {
        const key = 'rbac:roles:system-role-id';

        // Step 1: Check Redis
        try {
            const cached = await redis.get(key);
            if (cached !== null) return cached;
        } catch (err) {
            console.warn('[UserContextCache] GET failed for system role ID:', (err as Error).message);
        }

        // Step 3: Query DB
        const result = await db.query("SELECT id FROM roles WHERE scope = 'SYSTEM' LIMIT 1");
        const roleId: string | null = result.rows[0]?.id ?? null;

        // Step 5: Fill cache
        if (roleId) {
            try {
                await redis.set(key, roleId, 'EX', SYSTEM_ROLE_TTL);
            } catch (err) {
                console.warn('[UserContextCache] Failed to cache system role ID:', (err as Error).message);
            }
        }

        return roleId;
    }

    // ─── getProjectRoleId() ─────────────────────────────────────────────
    //
    // Gets a user's role ID within a specific project.
    // Returns null if the user is not a member of the project.
    //
    // THIS METHOD DEMONSTRATES: Negative Caching
    //
    // The key includes BOTH userId AND projectId — a "composite key":
    //   rbac:user:alice-uuid:project:proj-uuid:role → "role-uuid" or "__NOT_FOUND__"
    //
    async getProjectRoleId(userId: string, projectId: string): Promise<string | null> {
        const key = `rbac:user:${userId}:project:${projectId}:role`;

        // ── Step 1: Check Redis ─────────────────────────────────────────
        try {
            const cached = await redis.get(key);

            if (cached !== null) {
                // ── Step 2: Cache hit ───────────────────────────────────
                //
                // But wait — the cached value might be our sentinel!
                //
                // If cached === "__NOT_FOUND__":
                //   This means we previously checked the DB and the user
                //   had no role in this project. Return null WITHOUT hitting DB.
                //
                // If cached === "some-uuid":
                //   This is the actual roleId. Return it.
                //
                if (cached === NOT_FOUND_SENTINEL) return null;
                return cached;
            }
        } catch (err) {
            console.warn('[UserContextCache] GET failed for project role:', (err as Error).message);
        }

        // ── Step 3: Cache miss → Query PostgreSQL ───────────────────────
        const result = await db.query(
            'SELECT "roleId" FROM members WHERE "userId" = $1 AND "projectId" = $2',
            [userId, projectId]
        );
        const roleId: string | null = result.rows[0]?.roleId ?? null;

        // ── Step 5: Fill cache ──────────────────────────────────────────
        //
        // NEGATIVE CACHING IN ACTION:
        //   If roleId is null (user is not a member), we store "__NOT_FOUND__"
        //   instead of skipping the cache write.
        //
        //   Next time this is called with the same userId + projectId:
        //     Redis returns "__NOT_FOUND__" → we return null immediately
        //     No DB query needed!
        //
        //   The TTL ensures this negative cache expires. So if the user IS
        //   added to the project later, the stale "__NOT_FOUND__" will expire
        //   within 10 minutes (or be invalidated immediately by Layer 4).
        //
        try {
            const valueToCache = roleId ?? NOT_FOUND_SENTINEL;
            await redis.set(key, valueToCache, 'EX', ROLE_TTL);
        } catch (err) {
            console.warn('[UserContextCache] Failed to cache project role:', (err as Error).message);
        }

        return roleId;
    }

    // ─── getOrgRoleId() ─────────────────────────────────────────────────
    //
    // Gets a user's role ID within a specific organization (org-level only,
    // not project-level). Same pattern as getProjectRoleId().
    //
    // The DB query specifically filters for "projectId IS NULL" to get
    // only the ORG-scoped membership, not any project memberships.
    //
    async getOrgRoleId(userId: string, orgId: string): Promise<string | null> {
        const key = `rbac:user:${userId}:org:${orgId}:role`;

        // Step 1: Check Redis
        try {
            const cached = await redis.get(key);
            if (cached !== null) {
                if (cached === NOT_FOUND_SENTINEL) return null;
                return cached;
            }
        } catch (err) {
            console.warn('[UserContextCache] GET failed for org role:', (err as Error).message);
        }

        // Step 3: Query DB
        const result = await db.query(
            'SELECT "roleId" FROM members WHERE "userId" = $1 AND "orgId" = $2 AND "projectId" IS NULL',
            [userId, orgId]
        );
        const roleId: string | null = result.rows[0]?.roleId ?? null;

        // Step 5: Fill cache (with negative caching)
        try {
            const valueToCache = roleId ?? NOT_FOUND_SENTINEL;
            await redis.set(key, valueToCache, 'EX', ROLE_TTL);
        } catch (err) {
            console.warn('[UserContextCache] Failed to cache org role:', (err as Error).message);
        }

        return roleId;
    }

    // ─── invalidateUser() ───────────────────────────────────────────────
    //
    // Deletes ALL cached data for a specific user.
    // Called when a user's roles or admin status changes.
    //
    // REDIS SCAN — WHY NOT JUST USE `KEYS`?
    //
    //   You might think: redis.keys('rbac:user:123:*') → delete all matches.
    //   That WORKS, but it's DANGEROUS in production:
    //
    //   KEYS command:
    //     - Scans the ENTIRE keyspace in ONE blocking operation
    //     - While scanning, Redis can't serve ANY other commands
    //     - With 1 million keys, this can freeze Redis for SECONDS
    //     - It's fine for debugging (redis-cli), terrible for application code
    //
    //   SCAN command:
    //     - Scans the keyspace in SMALL BATCHES (default ~10 keys at a time)
    //     - Between batches, Redis serves other commands normally
    //     - Uses a cursor to track progress across multiple calls
    //     - Might return duplicates (rare), so results should be de-duped
    //     - Guaranteed to eventually visit all keys
    //
    //   Think of it like:
    //     KEYS  = closing the library to do a full inventory (nobody can enter)
    //     SCAN  = checking one shelf at a time while the library stays open
    //
    //   ioredis provides `scanStream()` which wraps the cursor loop
    //   into a Node.js readable stream — much cleaner than manual cursor management.
    //
    async invalidateUser(userId: string): Promise<void> {
        const pattern = `rbac:user:${userId}:*`;

        try {
            // ── Create a SCAN stream ────────────────────────────────────
            //
            // scanStream() returns a readable stream that yields arrays of
            // matching keys. Under the hood, it calls:
            //   SCAN 0 MATCH rbac:user:123:* COUNT 100
            //   SCAN <cursor> MATCH rbac:user:123:* COUNT 100
            //   ...until cursor returns to 0 (meaning "done")
            //
            // COUNT 100 is a HINT (not a guarantee) for how many keys to
            // check per iteration. Redis may return fewer or more.
            //
            const stream = redis.scanStream({
                match: pattern,
                count: 100,
            });

            // ── Collect all matching keys ───────────────────────────────
            const keysToDelete: string[] = [];

            // The stream emits 'data' events, each with a batch of matching keys
            await new Promise<void>((resolve, reject) => {
                stream.on('data', (keys: string[]) => {
                    for (const key of keys) {
                        keysToDelete.push(key);
                    }
                });
                stream.on('end', resolve);
                stream.on('error', reject);
            });

            // ── Delete all found keys ───────────────────────────────────
            //
            // DEL key1 key2 key3 ... — deletes multiple keys in one command.
            // We only call DEL if there are keys to delete (DEL with 0 args is an error).
            //
            if (keysToDelete.length > 0) {
                await redis.del(...keysToDelete);
                console.log(`[UserContextCache] Invalidated ${keysToDelete.length} keys for user ${userId}`);
            }
        } catch (err) {
            // Invalidation failure is not catastrophic — TTL will eventually expire the keys.
            // But we should log it because stale cache = stale permissions (security risk).
            console.warn('[UserContextCache] Failed to invalidate user cache:', (err as Error).message);
        }
    }
}

// ─── SINGLETON EXPORT ───────────────────────────────────────────────────────
export const userContextCache = new UserContextCache();
