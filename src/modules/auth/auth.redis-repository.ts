/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LAYER 5: REFRESH TOKEN REDIS REPOSITORY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file migrates refresh token storage from PostgreSQL-only to Redis as the
 * PRIMARY read path, with PostgreSQL kept as a durable backup (dual-write).
 *
 * ── KEY ARCHITECTURAL SHIFT FROM LAYERS 2-4 ──
 *
 * In Layers 2-4, Redis was a CACHE — a fast shortcut in front of PostgreSQL.
 * If Redis went down, we just read from PostgreSQL (slower but works).
 *
 * In Layer 5, Redis is the PRIMARY STORE for token lookups:
 *   - Writes go to BOTH Redis and PostgreSQL (dual-write)
 *   - Reads try Redis FIRST, fall back to PostgreSQL on miss/failure
 *   - Deletes remove from BOTH stores
 *
 * Why dual-write instead of cache-aside?
 *   Redis is in-memory (volatile). If Redis restarts without persistence enabled,
 *   all tokens vanish. PostgreSQL gives us durability — users don't get logged out
 *   just because Redis had a hiccup.
 *
 * ── NEW REDIS CONCEPT: SETS (SADD, SMEMBERS, SREM) ──
 *
 * Problem: When a user logs out, we need to delete ALL their refresh tokens.
 * In PostgreSQL this is easy: DELETE FROM refresh_tokens WHERE userId = $1
 * But in Redis, tokens are stored as individual keys: auth:refresh:{hash}
 * We can't easily find "all keys belonging to user X" without SCAN (slow).
 *
 * Solution: Redis Sets — an unordered collection of unique strings.
 *
 *   SADD auth:refresh:user:{userId} "tokenHash1"   ← Add token to user's set
 *   SADD auth:refresh:user:{userId} "tokenHash2"   ← Add another (set = unique)
 *   SMEMBERS auth:refresh:user:{userId}             ← Get ALL tokens for user
 *   SREM auth:refresh:user:{userId} "tokenHash1"   ← Remove one token from set
 *   DEL auth:refresh:user:{userId}                  ← Delete the entire set
 *
 * This gives us O(1) add/remove and O(n) list — much faster than SCAN.
 *
 * Think of it like a reverse index:
 *   Forward:  tokenHash → { userId, expiresAt }    (individual SET keys)
 *   Reverse:  userId → { tokenHash1, tokenHash2 }  (Redis Set)
 *
 * ── TOKEN HASHING FOR REDIS KEYS ──
 *
 * We NEVER use raw tokens as Redis keys. Why?
 *   1. If someone gains read access to Redis (misconfigured ACL, debug tool),
 *      they'd see every active refresh token in plaintext
 *   2. SHA256 hash is one-way — knowing the hash doesn't reveal the token
 *   3. The hash function already exists: auth.service.ts → hashRefreshToken()
 *
 * Flow: Client sends raw token → we hash it → use hash as Redis key
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { redis } from '../../config/redis';
import { findUserById } from '../users/user.repository';
import crypto from 'crypto';

// ─── Key Design ─────────────────────────────────────────────────────────────
//
// Pattern 1: auth:refresh:{tokenHash}  →  String (JSON)
//   Stores: { userId, expiresAt }
//   TTL: 7 days (matches token expiry)
//   Purpose: Forward lookup — "given a token, who does it belong to?"
//
// Pattern 2: auth:refresh:user:{userId}  →  Set of tokenHashes
//   Stores: All active token hashes for one user
//   TTL: 7 days (refreshed on each new token)
//   Purpose: Reverse lookup — "given a user, what are all their tokens?"
//
// Why two patterns?
//   - Login/refresh need forward lookup (Pattern 1): token → userId
//   - Logout needs reverse lookup (Pattern 2): userId → all tokens → delete each
//
const KEY_PREFIX = 'auth:refresh';
const USER_SET_PREFIX = 'auth:refresh:user';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days = 604800 seconds

// ─── Helper: Hash a raw token with SHA256 ───────────────────────────────────
//
// Why hash here instead of importing from auth.service.ts?
//   To avoid circular dependency: auth.service → auth.repository → auth.redis-repository
//   This is a pure function with no dependencies, safe to duplicate.
//
function hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STORE REFRESH TOKEN IN REDIS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Redis commands used:
 *   SET auth:refresh:{hash} '{"userId":"...","expiresAt":"..."}' EX 604800
 *   SADD auth:refresh:user:{userId} {hash}
 *   EXPIRE auth:refresh:user:{userId} 604800
 *
 * Why Pipeline?
 *   Three commands need to happen together. Pipeline batches them into ONE
 *   network round trip instead of three. This is the same Pipeline concept
 *   from Layer 2 (permission cache reload), applied to a different use case.
 *
 * Why EXPIRE on the Set too?
 *   The Set tracks all token hashes for a user. Without a TTL, it would grow
 *   forever (orphaned hashes from expired tokens). By setting the same 7-day
 *   TTL, the Set auto-cleans alongside the individual token keys.
 *
 *   Note: EXPIRE resets the TTL each time. So if a user logs in again,
 *   the Set TTL extends — which is exactly what we want.
 */
export async function redisStoreRefreshToken(
    userId: string,
    rawToken: string,
    expiresAt: Date
): Promise<void> {
    try {
        const tokenHash = hashToken(rawToken);
        const tokenKey = `${KEY_PREFIX}:${tokenHash}`;
        const userSetKey = `${USER_SET_PREFIX}:${userId}`;

        // Calculate TTL from the actual expiration date
        // (more accurate than hardcoded 7 days — respects the caller's intent)
        const ttlSeconds = Math.max(
            1,
            Math.floor((expiresAt.getTime() - Date.now()) / 1000)
        );

        // The value stored per token — just enough to identify the owner
        const tokenData = JSON.stringify({
            userId,
            expiresAt: expiresAt.toISOString(),
        });

        // ── Pipeline: 3 commands, 1 network round trip ──
        //
        // Command 1: SET — store the token data with TTL
        //   SET auth:refresh:abc123... '{"userId":"uuid","expiresAt":"2026-03-08"}' EX 604800
        //
        // Command 2: SADD — add this token hash to the user's set
        //   SADD auth:refresh:user:uuid "abc123..."
        //   SADD = "Set ADD" — adds a member to a Redis Set
        //   If the member already exists, SADD does nothing (idempotent)
        //
        // Command 3: EXPIRE — refresh the Set's TTL
        //   EXPIRE auth:refresh:user:uuid 604800
        //   This ensures the Set doesn't outlive its token keys
        //
        const pipe = redis.pipeline();
        pipe.set(tokenKey, tokenData, 'EX', ttlSeconds);
        pipe.sadd(userSetKey, tokenHash);
        pipe.expire(userSetKey, ttlSeconds);
        await pipe.exec();

        console.log(`[Redis] Stored refresh token for user ${userId}`);
    } catch (err) {
        // ── Graceful Degradation ──
        // Redis write failed, but PostgreSQL write (in the facade) will still happen.
        // The token exists in PostgreSQL — user can still refresh via the fallback path.
        console.warn('[Redis] Failed to store refresh token:', err);
    }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIND USER BY REFRESH TOKEN (Redis → PostgreSQL user lookup)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Redis command used:
 *   GET auth:refresh:{hash}
 *
 * Flow:
 *   1. Hash the raw token → tokenHash
 *   2. GET from Redis → returns JSON { userId, expiresAt } or null
 *   3. If found → parse → get userId → fetch full user from PostgreSQL
 *   4. If not found → return null (facade will fall back to PostgreSQL query)
 *
 * Why do we still query PostgreSQL for the user?
 *   Redis only stores { userId, expiresAt } — enough to IDENTIFY the user.
 *   But the caller needs the FULL user object (name, email, isActive, etc.).
 *   We could cache the full user in Redis too, but that duplicates Layer 3's
 *   user context cache. Keeping it simple: Redis validates the token,
 *   PostgreSQL provides user details.
 *
 * Why check expiresAt manually?
 *   Redis TTL auto-deletes expired keys, so in theory the key won't exist
 *   after expiry. But there's a tiny race window: if TTL and expiresAt drift
 *   (e.g., clock skew), an extra check prevents using an "expired" token
 *   that Redis hasn't cleaned up yet.
 */
export async function redisFindUserByRefreshToken(rawToken: string) {
    try {
        const tokenHash = hashToken(rawToken);
        const tokenKey = `${KEY_PREFIX}:${tokenHash}`;

        const cached = await redis.get(tokenKey);

        if (!cached) {
            // Cache miss — could be expired, Redis restart, or never cached.
            // Return null so the facade can fall back to PostgreSQL.
            return null;
        }

        const { userId, expiresAt } = JSON.parse(cached);

        // Belt-and-suspenders: verify expiration even though TTL should handle it
        if (new Date(expiresAt) <= new Date()) {
            // Token expired but Redis TTL hasn't cleaned it yet (clock skew).
            // Clean it up proactively.
            await redis.del(tokenKey);
            return null;
        }

        // Token is valid — fetch full user from PostgreSQL
        // (Redis only stores the mapping, not the user object)
        const user = await findUserById(userId);
        return user || null;
    } catch (err) {
        // Redis read failed — return null so facade falls back to PostgreSQL
        console.warn('[Redis] Failed to find user by refresh token:', err);
        return null;
    }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DELETE A SINGLE REFRESH TOKEN
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Redis commands used:
 *   GET auth:refresh:{hash}          ← need userId to update the Set
 *   DEL auth:refresh:{hash}          ← remove the token key
 *   SREM auth:refresh:user:{userId} {hash}  ← remove from user's Set
 *
 * Why GET before DEL?
 *   We need the userId stored in the token data to know WHICH user's Set
 *   to remove from. Without this, we'd have to SCAN all user Sets looking
 *   for this tokenHash — much slower.
 *
 * SREM = "Set REMove" — removes a specific member from a Redis Set.
 *   If the member doesn't exist, SREM does nothing (safe, idempotent).
 *   Returns the number of members actually removed (0 or 1).
 */
export async function redisDeleteRefreshToken(rawToken: string): Promise<void> {
    try {
        const tokenHash = hashToken(rawToken);
        const tokenKey = `${KEY_PREFIX}:${tokenHash}`;

        // Step 1: GET the token data to find userId (needed for SREM)
        const cached = await redis.get(tokenKey);

        if (cached) {
            const { userId } = JSON.parse(cached);
            const userSetKey = `${USER_SET_PREFIX}:${userId}`;

            // Step 2: Pipeline — delete token key + remove from user's Set
            const pipe = redis.pipeline();
            pipe.del(tokenKey);
            pipe.srem(userSetKey, tokenHash);
            await pipe.exec();

            console.log(`[Redis] Deleted refresh token for user ${userId}`);
        } else {
            // Token not in Redis (already expired or never cached)
            // Just try to delete the key in case it exists
            await redis.del(tokenKey);
        }
    } catch (err) {
        console.warn('[Redis] Failed to delete refresh token:', err);
    }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DELETE ALL REFRESH TOKENS FOR A USER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Redis commands used:
 *   SMEMBERS auth:refresh:user:{userId}   ← get ALL token hashes in the Set
 *   DEL auth:refresh:{hash1}              ← delete each token key
 *   DEL auth:refresh:{hash2}              ← delete each token key
 *   DEL auth:refresh:user:{userId}        ← delete the Set itself
 *
 * This is the REVERSE LOOKUP in action:
 *   1. SMEMBERS returns every tokenHash in the user's Set
 *   2. We Pipeline-DEL each individual token key
 *   3. We DEL the Set itself (cleanup)
 *
 * SMEMBERS = "Set MEMBERS" — returns ALL members of a Redis Set.
 *   Time complexity: O(n) where n = number of members.
 *   For refresh tokens, n is tiny (usually 1-3 active sessions per user).
 *
 * Why not just DEL the Set and skip individual token keys?
 *   Because the individual keys (auth:refresh:{hash}) are the FORWARD lookup.
 *   If we only delete the Set, someone with an old token could still validate
 *   it via GET auth:refresh:{hash} — the key would still exist!
 *   We MUST delete both directions: forward keys + reverse Set.
 *
 * Used by: Logout (delete all sessions) and Token Rotation (delete before new)
 */
export async function redisDeleteUserRefreshTokens(userId: string): Promise<void> {
    try {
        const userSetKey = `${USER_SET_PREFIX}:${userId}`;

        // Step 1: SMEMBERS — get all token hashes for this user
        const tokenHashes = await redis.smembers(userSetKey);

        if (tokenHashes.length === 0) {
            // No tokens in Redis for this user — nothing to clean
            return;
        }

        // Step 2: Pipeline — delete each token key + the Set itself
        //
        // Why Pipeline instead of individual DELs?
        //   If a user has 3 active sessions, that's 3 DEL + 1 DEL = 4 commands.
        //   Pipeline sends all 4 in ONE network round trip.
        //   For 1-3 tokens the performance gain is small, but the pattern
        //   is consistent with how we Pipeline everywhere else.
        //
        const pipe = redis.pipeline();

        for (const tokenHash of tokenHashes) {
            pipe.del(`${KEY_PREFIX}:${tokenHash}`);
        }

        // Delete the Set itself (all members removed, clean up the key)
        pipe.del(userSetKey);

        await pipe.exec();

        console.log(`[Redis] Deleted ${tokenHashes.length} refresh tokens for user ${userId}`);
    } catch (err) {
        console.warn('[Redis] Failed to delete user refresh tokens:', err);
    }
}
