import { db } from "../../config/db";

export async function updateRefreshToken(userId: string, refreshToken: string | null) {
  await db.query(
    `
      UPDATE users
      SET "refreshToken" = $1
      WHERE id = $2
    `,
    [refreshToken, userId]
  );
}

export async function findUserByRefreshToken(refreshToken: string) {
  const result = await db.query(
    `
      SELECT *
      FROM users
      WHERE "refreshToken" = $1
    `,
    [refreshToken]
  );

  return result.rows[0];
}

