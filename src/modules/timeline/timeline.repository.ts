import { db } from "../../config/db";

export async function getTicketComments(ticketId: string) {
  const result = await db.query(
    `
    SELECT
      c.id,
      c."createdAt",
      c.comment,
      u.name AS "userName",
      u.role AS "userRole",
      'COMMENT' AS type,
      '{}'::jsonb AS metadata
    FROM ticket_comments c
    JOIN users u ON u.id = c."userId"
    WHERE c."ticketId" = $1
    `,
    [ticketId]
  );

  return result.rows;
}

export async function getTicketActivity(ticketId: string) {
  const result = await db.query(
    `
    SELECT
      a.id,
      a."createdAt",
      a.type,
      a.metadata,
      u.name AS "userName",
      u.role AS "userRole",
      CASE WHEN r.id IS NOT NULL THEN json_build_object(
        'id', r.id,
        'name', r.name,
        'email', r.email,
        'role', r.role
      ) ELSE NULL END AS resolver
    FROM ticket_activity a
    JOIN users u ON u.id = a."performedBy"
    LEFT JOIN users r ON r.id::text = a.metadata->>'resolverId'
    WHERE a."ticketId" = $1
    `,
    [ticketId]
  );

  return result.rows;
}
