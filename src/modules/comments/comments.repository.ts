import { db } from '../../config/db';

export const createComment = async (data: {
    ticketId: string;
    userId: string;
    comment: string;
}) => {
    const result = await db.query(
        `
        INSERT INTO ticket_comments ("ticketId", "userId", comment)
        VALUES ($1, $2, $3)
        RETURNING *
        `,
        [data.ticketId, data.userId, data.comment],
    );

    return result.rows[0];
};

export const getCommentsByTicketId = async (ticketId: string) => {
    const result = await db.query(
        `
        SELECT
            c.*,
            json_build_object(
                'id', u.id,
                'name', u.name,
                'email', u.email
            ) AS user
        FROM ticket_comments c
        LEFT JOIN users u ON c."userId" = u.id
        WHERE c."ticketId" = $1
        ORDER BY c."createdAt" ASC
        `,
        [ticketId],
    );

    return result.rows;
};
