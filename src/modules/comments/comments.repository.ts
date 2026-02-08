import { db } from '../../config/db';

export const createComment = async (data: {
    ticketId: string;
    userId: string;
    comment: string;
}) => {
    const result = await db.query(
        `
        INSERT INTO ticket_comments (ticket_id, user_id, comment)
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
                'email', u.email,
                'role', u.role
            ) AS user
        FROM ticket_comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.ticket_id = $1
        ORDER BY c.created_at ASC
        `,
        [ticketId],
    );

    return result.rows;
};
