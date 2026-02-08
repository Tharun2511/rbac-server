import { db } from "../../config/db";

export async function logActivity(ticketId: string, userId: string, type: string, metadata?: any) {
  const result = await db.query(
    `
    INSERT INTO ticket_activity (ticket_id, performed_by, type, metadata)
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
      u.name AS "userName",
      u.role AS "userRole"
    FROM ticket_activity a
    JOIN users u ON u.id = a.performed_by
    WHERE a.ticket_id = $1
    ORDER BY a.created_at ASC
    `,
    [ticketId]
  );

  return result.rows;
}
