import { db } from "../../config/db";

export async function logActivity(ticketId: string, userId: string, type: string, metadata?: any) {
  const result = await db.query(
    `
    INSERT INTO ticket_activity ("ticketId", "performedBy", type, metadata)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [ticketId, userId, type, metadata || {}]
  );
  return result.rows[0];
}

export async function getActivity(ticketId: string) {
  const result = await db.query(
    `
    SELECT 
      a.*, 
      u.name AS "userName"
    FROM ticket_activity a
    JOIN users u ON u.id = a."performedBy"
    WHERE a."ticketId" = $1
    ORDER BY a."createdAt" ASC
    `,
    [ticketId]
  );

  return result.rows;
}
