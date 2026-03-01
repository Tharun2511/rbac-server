/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LAYER 5: REFRESH TOKEN REPOSITORY — DUAL-WRITE FACADE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file used to contain ONLY PostgreSQL queries for refresh tokens.
 * Now it's a FACADE — same function signatures, but internally it coordinates
 * between Redis (fast) and PostgreSQL (durable).
 *
 * ── WHAT IS A FACADE? ──
 *
 * A facade is a single interface that hides complexity behind it.
 * Every consumer (auth.service.ts, auth.controller.ts) still imports from
 * this file with zero code changes. They don't know (or care) that Redis
 * is now involved.
 *
 *   auth.controller.ts                      auth.service.ts
 *        │                                       │
 *        └──────── import from ──────────────────┘
 *                       │
 *                auth.repository.ts   ← THIS FILE (facade)
 *                    /         \
 *             Redis              PostgreSQL
 *         (primary read)      (durable backup)
 *
 * ── DUAL-WRITE PATTERN ──
 *
 * For WRITES (store, delete):
 *   1. Write to Redis (try/catch — non-blocking on failure)
 *   2. Write to PostgreSQL (ALWAYS — this is the durable backup)
 *   If Redis fails, PostgreSQL still has the data. Next read falls back.
 *
 * For READS (find user by token):
 *   1. Try Redis first (fast path — sub-millisecond)
 *   2. If Redis returns null → fall back to PostgreSQL (slow path — JOIN query)
 *   3. If Redis throws error → fall back to PostgreSQL
 *
 * ── WHY NOT JUST USE REDIS? ──
 *
 * Redis stores data in memory. If Redis restarts (crash, update, OOM kill),
 * all data is lost unless Redis persistence (RDB/AOF) is configured.
 * Many production setups DON'T enable persistence for cache instances.
 *
 * By dual-writing to PostgreSQL, we get the best of both worlds:
 *   - Speed: Redis serves 99%+ of reads in sub-millisecond
 *   - Durability: PostgreSQL survives Redis restarts
 *   - Resilience: Redis down = slightly slower, not broken
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../../config/db";
import {
    redisStoreRefreshToken,
    redisFindUserByRefreshToken,
    redisDeleteRefreshToken,
    redisDeleteUserRefreshTokens,
} from "./auth.redis-repository";

/**
 * ── STORE REFRESH TOKEN (Dual-Write: Redis + PostgreSQL) ──
 *
 * Write order: Redis first, then PostgreSQL.
 * Why Redis first? If Redis write fails, we log and continue to PostgreSQL.
 * If PostgreSQL write fails, the function throws (critical — source of truth).
 *
 * The caller doesn't need to change anything. Same signature as before:
 *   storeRefreshToken(userId, token, expiresAt) → void
 */
export async function storeRefreshToken(userId: string, token: string, expiresAt: Date) {
    // Step 1: Write to Redis (non-blocking on failure)
    // The redis function has its own try/catch — it logs and swallows errors.
    await redisStoreRefreshToken(userId, token, expiresAt);

    // Step 2: Write to PostgreSQL (ALWAYS — durable backup)
    // If this fails, the error propagates to the caller (as before).
    await db.query(
        `
        INSERT INTO refresh_tokens (token, "userId", "expiresAt")
        VALUES ($1, $2, $3)
        `,
        [token, userId, expiresAt]
    );
}

/**
 * ── FIND USER BY REFRESH TOKEN (Redis-first, PostgreSQL fallback) ──
 *
 * This is the key read path that benefits most from Redis:
 *   - Before: PostgreSQL JOIN query (~2-5ms) on every token refresh
 *   - After:  Redis GET (~0.1ms) + PostgreSQL findById (~1ms) = ~1.1ms
 *   - Fallback: Original PostgreSQL JOIN query (~2-5ms) if Redis misses
 *
 * Flow:
 *   1. Ask Redis: "Do you have this token?" → returns user object or null
 *   2. If Redis found it → return the user (fast path)
 *   3. If Redis returned null → query PostgreSQL (slow path, same as before)
 */
export async function findUserByRefreshToken(token: string) {
    // Step 1: Try Redis (fast path)
    const redisResult = await redisFindUserByRefreshToken(token);

    if (redisResult) {
        // Redis found the token AND fetched the user — done!
        return redisResult;
    }

    // Step 2: Redis miss — fall back to PostgreSQL (slow path)
    // This happens when:
    //   a) Token was stored before Layer 5 (only in PostgreSQL)
    //   b) Redis restarted and lost the data
    //   c) Redis is down
    //   d) Token genuinely doesn't exist (expired or invalid)
    const result = await db.query(
        `
        SELECT u.*
        FROM users u
        JOIN refresh_tokens rt ON u.id = rt."userId"
        WHERE rt.token = $1 AND rt."expiresAt" > NOW()
        `,
        [token]
    );

    return result.rows[0];
}

/**
 * ── DELETE SINGLE REFRESH TOKEN (Dual-Delete: Redis + PostgreSQL) ──
 *
 * Removes one specific token from both stores.
 * Used during token rotation (delete old token before storing new one).
 */
export async function deleteRefreshToken(token: string) {
    // Step 1: Remove from Redis (non-blocking on failure)
    await redisDeleteRefreshToken(token);

    // Step 2: Remove from PostgreSQL (ALWAYS)
    await db.query(
        `DELETE FROM refresh_tokens WHERE token = $1`,
        [token]
    );
}

/**
 * ── DELETE ALL USER REFRESH TOKENS (Dual-Delete: Redis + PostgreSQL) ──
 *
 * Removes ALL tokens for a user from both stores.
 * Used by:
 *   - Logout: Clear all sessions
 *   - Token rotation: Delete all old tokens before storing new one
 *
 * Redis side uses SMEMBERS (reverse lookup) to find all token hashes,
 * then Pipeline-DELs each one. See auth.redis-repository.ts for details.
 */
export async function deleteUserRefreshTokens(userId: string) {
    // Step 1: Remove from Redis (non-blocking on failure)
    await redisDeleteUserRefreshTokens(userId);

    // Step 2: Remove from PostgreSQL (ALWAYS)
    await db.query(
        `DELETE FROM refresh_tokens WHERE "userId" = $1`,
        [userId]
    );
}
