import { db } from '../../config/db';

export const createTicket = async (data: {
    title: string;
    description: string;
    createdBy: string;
}) => {
    const result = await db.query(
        `
        INSERT INTO tickets (title, description, createdBy, status)
        VALUES ($1, $2, $3, 'OPEN')
        RETURNING *
        `,
        [data.title, data.description, data.createdBy],
    );

    return result.rows[0];
};

export const assignTicket = async (ticketId: string, userId: string) => {
    const result = await db.query(
        `
        UPDATE tickets  
        SET assigned_to = $1
        WHERE id = $2
        RETURNING *
        `,
        [userId, ticketId],
    );

    return result.rows[0];
};

export const changeTicketStatus = async (ticketId: string, ticketStatus: string) => {
    const result = await db.query(
        `
        UPDATE tickets
        SET status = $1
        WHERE id = $2
        RETURNING *
        `,
        [ticketStatus, ticketId],
    );

    return result.rows[0];
};

export const findTicketsAssignedToUser = async (userId: string) => {
    const result = await db.query(
        `
        SELECT * 
        FROM tickets
        WHERE assigned_to = $1
        `,
        [userId],
    );

    return result.rows[0];
};

export const findTicketById = async (ticketId: string) => {
    const result = await db.query(
        `
        SELECT * 
        FROM tickets
        WHERE id = $1
        `,
        [ticketId],
    );

    return result.rows[0];
};
