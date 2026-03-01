// ═══════════════════════════════════════════════════════════════════════════════
// src/rbac/cache-invalidation.ts — Cache Invalidation via Redis Pub/Sub
// ═══════════════════════════════════════════════════════════════════════════════
//
// LAYER 4: Instant cache invalidation across multiple server instances.
//
// WHAT THIS FILE TEACHES:
//   1. PUBLISH / SUBSCRIBE  — Real-time messaging between processes via Redis
//   2. Dedicated subscriber — Why Pub/Sub needs a SEPARATE Redis connection
//   3. Channel design       — Naming and message format for invalidation events
//   4. Multi-instance sync  — How 3 servers behind a load balancer stay in sync
//   5. Fire-and-forget      — Pub/Sub messages are NOT persisted (and why that's OK)
//
// THE PROBLEM (what Layers 2 & 3 left unsolved):
//
//   Layer 2: Permission cache has a 1-hour TTL.
//   Layer 3: User context cache has a 5-10 minute TTL.
//
//   Scenario: Admin changes a user's role at 2:00 PM.
//   Without Layer 4: The old role stays cached for up to 10 minutes.
//   With Layer 4:    A Pub/Sub message broadcasts instantly to all instances.
//                    Each instance clears the stale cache immediately.
//                    Next request fetches fresh data from DB.
//
//   Also: If you run 3 server instances behind a load balancer,
//   reloading permissions on Instance A doesn't help Instances B and C.
//   Pub/Sub solves this — one publish reaches ALL subscribers.
//
// ═══════════════════════════════════════════════════════════════════════════════

import Redis from 'ioredis';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { permissionCache } from './permission-cache';
import { userContextCache } from './user-context-cache';

// ─── CHANNEL NAME ───────────────────────────────────────────────────────────
//
// A Pub/Sub "channel" is like a radio frequency. Anyone tuned in (subscribed)
// hears every message. Anyone can broadcast (publish) to it.
//
// We use one channel for ALL invalidation events, with a "type" field in the
// JSON message to distinguish what kind of invalidation is needed.
//
// WHY ONE CHANNEL (not separate channels per type)?
//   - Simpler: one SUBSCRIBE call, one message handler
//   - Invalidation events are rare (a few per day), so one channel isn't noisy
//   - If we had high-frequency events (like real-time chat), separate channels
//     would make sense to let clients subscribe only to what they care about
//
const CHANNEL = 'rbac:invalidation';

// ─── MESSAGE TYPES ──────────────────────────────────────────────────────────
//
// Every message on the channel is a JSON string with a "type" field:
//
//   { "type": "all_permissions" }                  ← reload all role-permission mappings
//   { "type": "role_permissions" }                 ← same as above (alias)
//   { "type": "user_context", "userId": "uuid" }  ← invalidate one user's cached data
//
// The message handler below parses the JSON and dispatches to the right cache.
//

// ─── THE SUBSCRIBER CONNECTION ──────────────────────────────────────────────
//
// THIS IS THE MOST IMPORTANT CONCEPT IN THIS FILE.
//
// WHY DO WE NEED A SECOND REDIS CONNECTION?
//
//   When a Redis client calls SUBSCRIBE, it enters "subscriber mode."
//   In this mode, the client can ONLY run these commands:
//     - SUBSCRIBE / UNSUBSCRIBE
//     - PSUBSCRIBE / PUNSUBSCRIBE (pattern-based subscribe)
//     - PING
//
//   ALL other commands are BLOCKED:
//     redis.get('some-key')  → ERROR: "Connection in subscriber mode"
//     redis.set('key', 'v')  → ERROR: "Connection in subscriber mode"
//     redis.mget(...)        → ERROR: "Connection in subscriber mode"
//
//   WHY does Redis do this?
//     Because a subscribed client is in a special "push" state — Redis pushes
//     messages TO the client whenever they arrive. Mixing push messages with
//     request-response commands (GET → response, SET → OK) would create
//     ambiguity: "Is this response for my GET, or is it a Pub/Sub message?"
//
//   So we need TWO connections:
//
//     ┌─────────────────────────────────────────────────────────────┐
//     │  redis (from config/redis.ts)  — the MAIN client           │
//     │    Used for: GET, SET, MGET, PIPELINE, DEL, PUBLISH        │
//     │    Mode: normal request-response                            │
//     │    Shared by: permission cache, user context cache, etc.    │
//     ├─────────────────────────────────────────────────────────────┤
//     │  subscriber (created HERE)  — the LISTENER client           │
//     │    Used for: SUBSCRIBE only                                  │
//     │    Mode: subscriber (push messages)                          │
//     │    Purpose: receive invalidation events from other instances │
//     └─────────────────────────────────────────────────────────────┘
//
//   ANALOGY:
//     Main client   = your phone (you make calls, send texts, browse web)
//     Subscriber    = a walkie-talkie tuned to one channel (can only listen + talk on that channel)
//     You can't use the walkie-talkie to browse the web, and you can't
//     receive walkie-talkie broadcasts on your phone.
//
//   NOTE: PUBLISH does NOT require subscriber mode. The main client can publish.
//   Only SUBSCRIBE requires the dedicated connection.
//

let subscriber: Redis | null = null;

// ─── initCacheInvalidation() ────────────────────────────────────────────────
//
// Called once at server startup (from server.ts).
// Creates the subscriber connection and starts listening.
//
// This is NON-BLOCKING — if Redis is down, the server still starts.
// Pub/Sub is a "nice to have" for instant invalidation; TTLs are the fallback.
//
export async function initCacheInvalidation(): Promise<void> {
    try {
        // ── Create a NEW Redis connection for subscribing ────────────────
        //
        // We use the same REDIS_URL and similar options as the main client.
        // The key differences:
        //   - maxRetriesPerRequest: null → ioredis requires this for subscriber mode.
        //     When set to a number, ioredis throws "maxRetriesPerRequest exceeded" errors
        //     for commands that can't complete in subscriber mode. Setting null tells
        //     ioredis "this is a subscriber client, don't limit retries per command."
        //   - retryStrategy: same exponential backoff as the main client
        //
        subscriber = new Redis(env.REDIS_URL, {
            maxRetriesPerRequest: null,   // Required for subscriber mode
            retryStrategy(times: number): number {
                const delay = Math.min(times * 200, 2000);
                console.log(`[CacheInvalidation] Subscriber reconnecting in ${delay}ms (attempt ${times})...`);
                return delay;
            },
        });

        subscriber.on('error', (err) => {
            // Log but don't crash — same graceful degradation principle as redis.ts
            console.error('[CacheInvalidation] Subscriber error:', err.message);
        });

        // ── Subscribe to the invalidation channel ────────────────────────
        //
        // REDIS COMMAND: SUBSCRIBE channel
        //
        // After this, the subscriber enters "subscriber mode."
        // It will receive every message published to 'rbac:invalidation'.
        //
        // The await resolves when Redis confirms the subscription.
        // From this point, any PUBLISH to this channel triggers our 'message' handler.
        //
        await subscriber.subscribe(CHANNEL);
        console.log(`[CacheInvalidation] Subscribed to '${CHANNEL}'`);

        // ── Register the message handler ─────────────────────────────────
        //
        // The 'message' event fires every time someone PUBLISHes to our channel.
        //
        // Parameters:
        //   channel — which channel the message came from (we only subscribe to one,
        //             but if you subscribed to multiple, this tells you which)
        //   message — the raw string that was published (we use JSON)
        //
        // IMPORTANT: This handler runs on EVERY instance that subscribed.
        //   If Instance A publishes, Instances A, B, and C all receive and handle it.
        //   This is intentional — Instance A's own cache also needs invalidation.
        //
        subscriber.on('message', async (channel: string, message: string) => {
            if (channel !== CHANNEL) return;  // Safety check (shouldn't happen with single subscribe)

            try {
                const payload = JSON.parse(message);

                switch (payload.type) {
                    // ── Permission reload ─────────────────────────────────
                    //
                    // Triggered when:
                    //   - Admin hits POST /system/reload-permissions
                    //   - Or any system that changes role-to-permission mappings
                    //
                    // What it does:
                    //   Calls permissionCache.reload() from Layer 2, which:
                    //   1. DELs the 'rbac:roles:loaded' flag in Redis
                    //   2. Re-queries PostgreSQL for all role permissions
                    //   3. Writes fresh data to Redis via Pipeline
                    //   4. Updates the in-memory Map fallback
                    //
                    case 'all_permissions':
                    case 'role_permissions':
                        console.log('[CacheInvalidation] Reloading permissions (triggered by Pub/Sub)');
                        await permissionCache.reload();
                        break;

                    // ── User context invalidation ─────────────────────────
                    //
                    // Triggered when:
                    //   - A member is added to an org or project
                    //   - A member is removed from a project
                    //   - A user's admin status changes
                    //
                    // What it does:
                    //   Calls userContextCache.invalidateUser() from Layer 3, which:
                    //   1. SCANs for all keys matching rbac:user:{userId}:*
                    //   2. DELs all matched keys (profile, org roles, project roles)
                    //   3. Next request for this user will cache-miss → fresh DB query
                    //
                    case 'user_context':
                        if (payload.userId) {
                            console.log(`[CacheInvalidation] Invalidating user ${payload.userId} (triggered by Pub/Sub)`);
                            await userContextCache.invalidateUser(payload.userId);
                        } else {
                            console.warn('[CacheInvalidation] user_context message missing userId');
                        }
                        break;

                    default:
                        console.warn(`[CacheInvalidation] Unknown message type: ${payload.type}`);
                }
            } catch (err) {
                // Bad JSON or handler error — log and continue.
                // One bad message shouldn't break the subscriber.
                console.error('[CacheInvalidation] Error handling message:', (err as Error).message);
            }
        });

    } catch (err) {
        // If we can't set up Pub/Sub, the app still works.
        // TTLs from Layers 2 and 3 provide eventual cache freshness.
        console.warn('[CacheInvalidation] Failed to initialize Pub/Sub:', (err as Error).message);
        console.warn('[CacheInvalidation] Cache invalidation will rely on TTL expiry only.');
    }
}

// ─── publishInvalidation() ──────────────────────────────────────────────────
//
// Sends an invalidation message to ALL subscribed instances.
//
// REDIS COMMAND: PUBLISH channel message
//   Returns: the number of clients that received the message (0 if no subscribers)
//
// IMPORTANT: We use the MAIN redis client (not the subscriber) to publish.
// PUBLISH is a normal command — it doesn't require subscriber mode.
// In fact, the subscriber client CAN'T publish (it's locked in subscriber mode).
//
// FIRE-AND-FORGET:
//   If no instances are subscribed (e.g., all servers just restarted and
//   haven't called initCacheInvalidation yet), the message is lost.
//   This is fine because:
//     1. TTLs ensure eventual freshness anyway (safety net)
//     2. If a server just restarted, its cache is empty (no stale data to worry about)
//     3. Pub/Sub is an optimization, not a guarantee
//
//   Compare with a message queue (RabbitMQ, Kafka):
//     Queue: message persists until a consumer processes it (at-least-once delivery)
//     Pub/Sub: message is delivered to whoever is listening RIGHT NOW (at-most-once)
//
//   For cache invalidation, at-most-once is perfect — the worst case is
//   a cache hit on stale data, which TTL will fix shortly.
//
export async function publishInvalidation(message: { type: string; userId?: string }): Promise<void> {
    try {
        const payload = JSON.stringify(message);
        const receiversCount = await redis.publish(CHANNEL, payload);
        console.log(`[CacheInvalidation] Published to '${CHANNEL}': ${payload} (${receiversCount} receivers)`);
    } catch (err) {
        // Publish failure is not critical — TTLs handle eventual consistency.
        console.warn('[CacheInvalidation] Failed to publish:', (err as Error).message);
    }
}

// ─── shutdownCacheInvalidation() ────────────────────────────────────────────
//
// Clean shutdown: unsubscribe from the channel, close the subscriber connection.
//
// WHY UNSUBSCRIBE BEFORE QUIT?
//   Technically, quit() alone would work — it closes the connection and Redis
//   automatically removes the client from all subscriptions.
//   But explicit unsubscribe is cleaner:
//     1. Redis immediately stops sending messages to this client
//     2. The 'message' handler won't fire during shutdown
//     3. Other instances see the subscriber count drop by 1 (useful for monitoring)
//
export async function shutdownCacheInvalidation(): Promise<void> {
    if (!subscriber) return;

    try {
        await subscriber.unsubscribe(CHANNEL);
        await subscriber.quit();
        subscriber = null;
        console.log('[CacheInvalidation] Shut down cleanly');
    } catch (err) {
        console.warn('[CacheInvalidation] Error during shutdown:', (err as Error).message);
    }
}

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────────────
//
// Same pattern as redis.ts — clean up on Ctrl+C.
// This runs ALONGSIDE the redis.ts SIGINT handler (Node.js allows multiple
// listeners on the same event).
//
process.on('SIGINT', async () => {
    await shutdownCacheInvalidation();
});
