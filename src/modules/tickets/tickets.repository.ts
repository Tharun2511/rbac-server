import { db } from '../../config/db';

export const createTicket = async (data: {
    title: string;
    description: string;
    createdBy: string;
}) => {
    const result = await db.query(
        `
        INSERT INTO tickets (title, description, "createdBy", status)
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
        SET resolverId = $1
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
        WHERE resolverId = $1
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

export const findAllTickets = async () => {
    const result = await db.query(
        `
        SELECT *
        FROM tickets
        `,
    );

    return result.rows[0];
};

export const getMyTickets = async (userId: string) => {
    const result = await db.query(
        `
    SELECT
        t.*,

        -- Resolver details
        json_build_object(
            'id', r.id,
            'name', r.name,
            'email', r.email,
            'role', r.role
        ) AS resolver,

        -- Creator details
        json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'role', u.role
        ) AS "createdUser"

    FROM tickets t

    -- Join resolver
    LEFT JOIN users r
        ON t."resolverId" = r.id

    -- Join creator
    JOIN users u
        ON t."createdBy" = u.id

    WHERE t."createdBy" = $1

    ORDER BY t."createdAt" DESC
    `,
        [userId],
    );

    return result.rows;
};

export const getHistoryTickets = async (userId: string) => {
    const result = await db.query(
        `
        SELECT 
          t.*,

          -- Resolver Details
          json_build_object(
            id', r.id,
            'name', r.name,
            'email', r.email,
            'role', r.role
          ) as resolver,

          -- Creator Details
          json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'role', u.role
          ) as createdUser

          -- Join resolver
          LEFT JOIN on users r
            ON t."resolverId" = r.id

          -- Join CreatedUser
          JOIN on users u
            on t."createdBy" = u.id

          WHERE t."createdBy" = $1

          AND t.status IN ("CLOSED", "VERIFIED_BY_USER", "RESOLVED_BY_RESOLVER")

          ORDER BY t."createdAt" DESC
        `,
    );
    return result.rows;
};
