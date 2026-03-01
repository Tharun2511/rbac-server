// ═══════════════════════════════════════════════════════════════════════════════
// src/rbac/redis-permission-cache.ts — Redis-Backed Permission Cache
// ═══════════════════════════════════════════════════════════════════════════════
//
// LAYER 2: Migrates the in-memory permission cache to Redis.
//
// WHAT THIS FILE TEACHES:
//   1. SET / GET      — Basic Redis read/write (Redis stores STRINGS only)
//   2. JSON serialize — Converting JavaScript objects to/from Redis-compatible strings
//   3. TTL (EX)       — Auto-expiring keys so stale data cleans itself up
//   4. Key naming     — Colon-separated namespaces (Redis convention)
//   5. Pipeline       — Batching multiple writes into ONE network round trip
//   6. MGET           — Fetching multiple keys in ONE command (vs multiple GETs)
//   7. Graceful fallback — If Redis is down, fall back to in-memory Map
//
// BEFORE (Layer 0 — in-memory only):
//   Server starts → query PostgreSQL → store in Map → serve from Map
//   Problem: every restart re-queries DB, each instance loads independently
//
// AFTER (Layer 2 — Redis + in-memory fallback):
//   Server starts → check Redis flag → if loaded, skip DB → serve from Redis
//   If Redis is down → fall back to in-memory Map (same as before)
//
// ═══════════════════════════════════════════════════════════════════════════════

import { redis } from '../config/redis';
import { db } from '../config/db';

// ─── KEY NAMING CONVENTION ──────────────────────────────────────────────────
//
// Redis has NO tables, NO schemas, NO folders. Every piece of data is a
// key-value pair in ONE flat namespace. So how do you organize thousands of keys?
//
// CONVENTION: Use colons (:) as namespace separators.
//
//   rbac:role:{roleId}:perms    ← "in the rbac namespace, for this role, its permissions"
//   rbac:roles:loaded           ← "in the rbac namespace, have roles been loaded?"
//   auth:refresh:{tokenHash}   ← (Layer 5) "in the auth namespace, this refresh token"
//
// WHY COLONS?
//   - Redis tools (like RedisInsight) parse colons as folder separators in their UI
//   - Makes SCAN patterns easy: "rbac:role:*" finds all role permission keys
//   - It's a community convention, not enforced by Redis itself
//
// WHY PREFIX WITH "rbac:"?
//   - Multiple features share the same Redis instance (auth, rate limiting, etc.)
//   - Prefixing prevents key collisions: "rbac:role:123" won't clash with "auth:role:123"
//
const KEY_PREFIX = 'rbac:role:';
const KEY_SUFFIX = ':perms';
const LOADED_FLAG_KEY = 'rbac:roles:loaded';

// ─── TTL (Time-To-Live) ────────────────────────────────────────────────────
//
// Every key we store gets a TTL — Redis automatically DELETES the key after
// this many seconds. No cron jobs, no cleanup scripts, no manual expiry.
//
// WHY 1 HOUR?
//   - Permissions rarely change (maybe a few times per day)
//   - 1 hour means: worst case, a permission change takes up to 1 hour to
//     propagate without manual reload (Layer 4 adds instant invalidation)
//   - Too short (e.g., 30s) = too many DB reloads, defeating the cache purpose
//   - Too long (e.g., 24h) = stale permissions for too long if someone forgets to reload
//
// HOW IT WORKS:
//   redis.set('key', 'value', 'EX', 3600)
//                                ↑    ↑
//                          flag: "set expiry"  seconds
//
//   After 3600 seconds, Redis runs: DEL key (automatically, in the background)
//
const PERMISSION_TTL_SECONDS = 3600; // 1 hour

class RedisPermissionCache {

    // ─── IN-MEMORY FALLBACK ─────────────────────────────────────────────
    //
    // These are IDENTICAL to the original permission-cache.ts.
    // They serve as a safety net: if Redis is down, the app still works
    // using this in-memory Map — just like it did before Layer 2.
    //
    // This is the "graceful degradation" principle from redis.ts:
    //   Redis UP   → fast path (sub-ms Redis reads)
    //   Redis DOWN → slow path (in-memory Map, loaded from PostgreSQL)
    //   Redis DOWN ≠ app down
    //
    private rolePermissions: Map<string, Set<string>> = new Map();
    private isLoaded = false;
    private loadPromise: Promise<void> | null = null;

    // ─── ensureLoaded() ─────────────────────────────────────────────────
    //
    // Called on every permission check (via getPermissions).
    // Guarantees that permission data exists before we try to read it.
    //
    // FLOW:
    //   1. Already loaded in this instance? → return immediately
    //   2. Check Redis: did ANOTHER instance already load? → mark loaded, return
    //   3. Neither? → load from PostgreSQL → write to Redis + in-memory Map
    //
    // WHY CHECK REDIS FIRST (step 2)?
    //   Imagine you have 3 server instances behind a load balancer.
    //   Instance A starts first and loads permissions into Redis.
    //   When Instance B starts, it checks Redis: "oh, permissions are already
    //   there!" — skips the DB query entirely. This is the multi-instance
    //   benefit of Redis over in-memory caching.
    //
    async ensureLoaded() {
        if (this.isLoaded) return;

        // Deduplicate concurrent calls (same pattern as original)
        if (!this.loadPromise) {
            this.loadPromise = this._doLoad();
        }
        await this.loadPromise;
    }

    private async _doLoad() {
        console.log('[RedisPermissionCache] Loading permissions...');
        const startTime = Date.now();

        try {
            // ── STEP 1: Check if another instance already loaded into Redis ──
            //
            // GET returns the value as a string, or null if the key doesn't exist.
            //
            // This is like checking a shared whiteboard:
            //   "Has anyone already done this work?" → If yes, skip.
            //
            const alreadyLoaded = await this._checkRedisLoaded();
            if (alreadyLoaded) {
                this.isLoaded = true;
                const duration = Date.now() - startTime;
                console.log(`[RedisPermissionCache] Skipped DB — Redis already loaded (${duration}ms)`);
                return;
            }
        } catch (err) {
            // Redis might be down — that's OK, we'll load from DB and use in-memory
            console.warn('[RedisPermissionCache] Redis unavailable for loaded check, loading from DB');
        }

        // ── STEP 2: Load from PostgreSQL (same query as original) ────────
        //
        // This is the "source of truth" query. Even with Redis, PostgreSQL
        // is where permissions ACTUALLY live. Redis is just a fast copy.
        //
        try {
            const result = await db.query(`
                SELECT
                    rp."roleId",
                    p.slug
                FROM role_permissions rp
                JOIN permissions p ON rp."permissionId" = p.id
            `);

            console.log(`[RedisPermissionCache] Fetched ${result.rows.length} permission entries from DB`);

            // ── STEP 3: Build the in-memory Map (fallback) ───────────────
            //
            // Always populate the Map, regardless of whether Redis works.
            // This ensures the app functions even if Redis dies mid-load.
            //
            this.rolePermissions.clear();

            for (const row of result.rows) {
                const roleId: string = row.roleId;
                const permissionSlug: string = row.slug;

                if (!this.rolePermissions.has(roleId)) {
                    this.rolePermissions.set(roleId, new Set());
                }
                this.rolePermissions.get(roleId)!.add(permissionSlug);
            }

            // ── STEP 4: Write to Redis via Pipeline ──────────────────────
            //
            // NOW THE KEY REDIS CONCEPT: Pipeline
            //
            // Without Pipeline (naive approach):
            //   await redis.set('rbac:role:aaa:perms', '["ticket.create"]', 'EX', 3600);  // round trip 1
            //   await redis.set('rbac:role:bbb:perms', '["ticket.view"]', 'EX', 3600);    // round trip 2
            //   await redis.set('rbac:role:ccc:perms', '["ticket.assign"]', 'EX', 3600);  // round trip 3
            //   // 10 roles = 10 network round trips = 10 × ~0.5ms = 5ms
            //
            // With Pipeline:
            //   const pipe = redis.pipeline();
            //   pipe.set('rbac:role:aaa:perms', '["ticket.create"]', 'EX', 3600);  // queued locally
            //   pipe.set('rbac:role:bbb:perms', '["ticket.view"]', 'EX', 3600);    // queued locally
            //   pipe.set('rbac:role:ccc:perms', '["ticket.assign"]', 'EX', 3600);  // queued locally
            //   await pipe.exec();  // ALL commands sent in ONE round trip!
            //   // 10 roles = 1 network round trip = ~0.5ms total
            //
            // WHY THIS MATTERS:
            //   Network latency (~0.1-0.5ms per round trip) adds up fast.
            //   Pipeline eliminates N-1 round trips by bundling commands.
            //   Redis processes them sequentially but the NETWORK cost is just once.
            //
            //   Think of it like mailing letters:
            //     Without pipeline: drive to post office 10 times (one letter each trip)
            //     With pipeline:    drive once with all 10 letters
            //
            await this._writeToRedis();

            this.isLoaded = true;
            const duration = Date.now() - startTime;
            console.log(`[RedisPermissionCache] Loaded in ${duration}ms. Roles cached: ${this.rolePermissions.size}`);

        } catch (error) {
            this.loadPromise = null; // Allow retry on failure
            console.error('[RedisPermissionCache] Failed to load:', error);
            throw error;
        }
    }

    // ─── _checkRedisLoaded() ────────────────────────────────────────────
    //
    // Checks the "loaded" flag key in Redis.
    //
    // REDIS COMMAND: GET key
    //   Returns: the string value, or null if key doesn't exist / has expired
    //
    // This flag key is a simple "boolean" — but Redis doesn't have booleans,
    // so we store the string 'true'. When the TTL expires, the key vanishes,
    // which means "not loaded" (null).
    //
    private async _checkRedisLoaded(): Promise<boolean> {
        const value = await redis.get(LOADED_FLAG_KEY);
        return value === 'true';
    }

    // ─── _writeToRedis() ────────────────────────────────────────────────
    //
    // Writes all role permissions to Redis using a Pipeline.
    //
    // If Redis is down, this silently fails and logs a warning.
    // The in-memory Map (populated in step 3) still has all the data.
    //
    private async _writeToRedis(): Promise<void> {
        try {
            // ── Create a Pipeline ────────────────────────────────────────
            //
            // redis.pipeline() returns a Pipeline object that queues commands
            // in memory WITHOUT sending them to Redis yet.
            //
            // Each method call (set, del, etc.) returns the pipeline itself,
            // so you can chain: pipe.set(...).set(...).exec()
            // But we use a loop here for clarity.
            //
            const pipe = redis.pipeline();

            // ── Queue SET commands for each role ─────────────────────────
            //
            // JSON SERIALIZATION: Redis values are ALWAYS strings.
            //   JavaScript:  Set { "ticket.create", "ticket.view" }
            //   We convert:  Set → Array → JSON string
            //   Redis value: '["ticket.create","ticket.view"]'
            //
            // Later when reading, we reverse: JSON string → Array → Set
            //
            // WHY JSON.stringify an Array, not the Set directly?
            //   JSON.stringify(new Set(['a','b'])) → '{}'  // WRONG! Sets aren't JSON-serializable
            //   JSON.stringify([...new Set(['a','b'])]) → '["a","b"]'  // Correct
            //
            for (const [roleId, permsSet] of this.rolePermissions) {
                const key = `${KEY_PREFIX}${roleId}${KEY_SUFFIX}`;

                // Convert Set to Array, then to JSON string
                const value = JSON.stringify(Array.from(permsSet));

                // SET key value EX seconds
                //  ↑    ↑    ↑   ↑    ↑
                //  cmd  key  val flag  TTL
                //
                // 'EX' means "set an expiry in seconds". After PERMISSION_TTL_SECONDS,
                // Redis automatically deletes this key. No cleanup code needed!
                //
                pipe.set(key, value, 'EX', PERMISSION_TTL_SECONDS);
            }

            // ── Queue the "loaded" flag ──────────────────────────────────
            //
            // This flag tells other server instances: "permissions are in Redis,
            // you don't need to query PostgreSQL."
            //
            // Same TTL as the permission keys — when it expires, the next
            // instance to call ensureLoaded() will reload from DB.
            //
            pipe.set(LOADED_FLAG_KEY, 'true', 'EX', PERMISSION_TTL_SECONDS);

            // ── Execute the Pipeline ─────────────────────────────────────
            //
            // NOW all queued commands are sent to Redis in a single round trip.
            // exec() returns an array of [error, result] pairs — one per command.
            //
            // If some commands fail (e.g., Redis runs out of memory mid-pipeline),
            // others may still succeed. We don't need to check individual results
            // here because the in-memory Map is already populated as fallback.
            //
            await pipe.exec();
            console.log(`[RedisPermissionCache] Pipeline: wrote ${this.rolePermissions.size} roles to Redis`);

        } catch (err) {
            // Redis is down or errored — that's OK.
            // The in-memory Map was already populated in _doLoad() step 3.
            console.warn('[RedisPermissionCache] Failed to write to Redis (using in-memory fallback):', (err as Error).message);
        }
    }

    // ─── reload() ───────────────────────────────────────────────────────
    //
    // Force-reload: clears the "loaded" flag and re-loads from PostgreSQL.
    //
    // Called when an admin hits POST /system/reload-permissions.
    // In Layer 4, this will also publish an invalidation message via Pub/Sub
    // so ALL server instances reload (not just this one).
    //
    async reload() {
        this.isLoaded = false;
        this.loadPromise = null;

        // ── DEL: Delete a key ────────────────────────────────────────────
        //
        // REDIS COMMAND: DEL key
        //   Removes the key and its value. Returns 1 if deleted, 0 if key didn't exist.
        //
        // WHY delete the flag?
        //   If we just call ensureLoaded(), it would check Redis, see
        //   'rbac:roles:loaded' = 'true', and SKIP the DB reload.
        //   By deleting the flag first, we force a fresh load from DB.
        //
        //   This also helps multi-instance: if Instance A reloads and deletes
        //   the flag, Instance B's next ensureLoaded() will also see "not loaded"
        //   and refresh from DB (or from what A just wrote to Redis).
        //
        try {
            await redis.del(LOADED_FLAG_KEY);
        } catch (err) {
            console.warn('[RedisPermissionCache] Failed to DEL loaded flag (continuing with reload):', (err as Error).message);
        }

        return this.ensureLoaded();
    }

    // ─── getPermissions() ───────────────────────────────────────────────
    //
    // Returns a merged Set of permission slugs for the given role IDs.
    //
    // STRATEGY: Try Redis first (fast path), fall back to in-memory Map (slow path).
    //
    // FAST PATH (Redis available):
    //   Uses MGET to fetch all role permissions in ONE command.
    //   No DB query, no in-memory Map lookup needed.
    //
    // SLOW PATH (Redis unavailable or cache miss):
    //   Ensures in-memory Map is loaded, then reads from it.
    //   This is identical to the original permission-cache.ts behavior.
    //
    async getPermissions(roleIds: string[]): Promise<Set<string>> {
        if (roleIds.length === 0) return new Set();

        // ── FAST PATH: Try Redis MGET ────────────────────────────────────
        //
        // REDIS COMMAND: MGET key1 key2 key3 ...
        //   Returns: [value1, value2, value3, ...] — in the SAME ORDER as the keys
        //   Missing keys return null in their position
        //
        // WHY MGET instead of multiple GETs?
        //   Same reason as Pipeline — fewer network round trips:
        //
        //   Multiple GETs:
        //     await redis.get('rbac:role:aaa:perms');  // round trip 1
        //     await redis.get('rbac:role:bbb:perms');  // round trip 2
        //     // 2 roles = 2 round trips
        //
        //   MGET:
        //     await redis.mget('rbac:role:aaa:perms', 'rbac:role:bbb:perms');
        //     // 2 roles = 1 round trip, returns [value1, value2]
        //
        //   Pipeline batches DIFFERENT commands (SET + SET + SET).
        //   MGET batches the SAME command (GET + GET + GET) into one.
        //   Both reduce round trips — use whichever fits the situation.
        //
        try {
            const keys = roleIds.map(id => `${KEY_PREFIX}${id}${KEY_SUFFIX}`);
            const values = await redis.mget(...keys);

            // Check if ALL keys were found in Redis (no nulls)
            // If any key is null, it means that role's permissions aren't cached.
            // This could happen if:
            //   - The role was just created and cache hasn't reloaded
            //   - The TTL expired for that specific key
            //   - Redis was restarted and lost data
            //
            const allFound = values.every(v => v !== null);

            if (allFound) {
                // ── Parse JSON and merge permissions ─────────────────────
                //
                // Reverse the serialization from _writeToRedis():
                //   Redis string: '["ticket.create","ticket.view"]'
                //   JSON.parse:   ["ticket.create", "ticket.view"]  (Array)
                //   Add to Set:   Set { "ticket.create", "ticket.view" }
                //
                const permissions = new Set<string>();

                for (const value of values) {
                    // TypeScript: we checked allFound above, so value is never null here.
                    // But we cast to be safe since mget returns (string | null)[].
                    const permsArray: string[] = JSON.parse(value as string);
                    for (const perm of permsArray) {
                        permissions.add(perm);
                    }
                }

                return permissions;
            }

            // Some keys missing — fall through to in-memory path below
            console.warn('[RedisPermissionCache] MGET: some keys missing in Redis, using in-memory fallback');

        } catch (err) {
            // Redis error — fall through to in-memory path
            console.warn('[RedisPermissionCache] MGET failed, using in-memory fallback:', (err as Error).message);
        }

        // ── SLOW PATH: In-Memory Fallback ────────────────────────────────
        //
        // If we get here, Redis didn't have the data (or is down).
        // Ensure the in-memory Map is loaded from DB, then read from it.
        // This is EXACTLY what the original permission-cache.ts did.
        //
        await this.ensureLoaded();

        const permissions = new Set<string>();
        for (const roleId of roleIds) {
            const rolePerms = this.rolePermissions.get(roleId);
            if (rolePerms) {
                for (const perm of rolePerms) {
                    permissions.add(perm);
                }
            }
        }
        return permissions;
    }

    // ─── hasPermission() ────────────────────────────────────────────────
    //
    // Convenience method: checks if any of the given roles has a specific permission.
    // Delegates entirely to getPermissions() — no separate Redis logic needed.
    //
    async hasPermission(roleIds: string[], permissionSlug: string): Promise<boolean> {
        const perms = await this.getPermissions(roleIds);
        return perms.has(permissionSlug);
    }
}

// ─── SINGLETON EXPORT ───────────────────────────────────────────────────────
//
// Same pattern as the original: one instance shared across the entire app.
// Every file that imports { permissionCache } gets this SAME object.
//
export const permissionCache = new RedisPermissionCache();
