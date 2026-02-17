import { db } from "../../config/db";

export async function getTicketComments(ticketId: string) {
  const result = await db.query(
    `
    SELECT
      c.id,
      c."createdAt",
      c.comment,
      u.name AS "userName",
      ro.name AS "userRole",
      'COMMENT' AS type,
      '{}'::jsonb AS metadata
    FROM ticket_comments c
    JOIN users u ON u.id = c."userId"
    JOIN tickets t ON t.id = c."ticketId"
    LEFT JOIN members m ON m."userId" = c."userId" AND m."projectId" = t."projectId"
    LEFT JOIN roles ro ON ro.id = m."roleId"
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
      ro.name AS "userRole",
      CASE WHEN r.id IS NOT NULL THEN json_build_object(
        'id', r.id,
        'name', r.name,
        'email', r.email
      ) ELSE NULL END AS resolver
    FROM ticket_activity a
    JOIN users u ON u.id = a."performedBy"
    JOIN tickets t ON t.id = a."ticketId"
    LEFT JOIN members m ON m."userId" = a."performedBy" AND m."projectId" = t."projectId"
    LEFT JOIN roles ro ON ro.id = m."roleId"
    LEFT JOIN users r ON r.id::text = a.metadata->>'resolverId'
    WHERE a."ticketId" = $1
    `,
    [ticketId]
  );

  return result.rows;
}
