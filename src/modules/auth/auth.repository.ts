import { db } from "../../config/db";

export async function storeRefreshToken(userId: string, token: string, expiresAt: Date) {
  await db.query(
    `
    INSERT INTO refresh_tokens (token, "userId", "expiresAt")
    VALUES ($1, $2, $3)
    `,
    [token, userId, expiresAt]
  );
}

export async function findUserByRefreshToken(token: string) {
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

export async function deleteRefreshToken(token: string) {
  await db.query(
    `DELETE FROM refresh_tokens WHERE token = $1`,
    [token]
  );
}

export async function deleteUserRefreshTokens(userId: string) {
  await db.query(
    `DELETE FROM refresh_tokens WHERE "userId" = $1`,
    [userId]
  );
}

