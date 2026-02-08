import { db } from '../../config/db';

export const createTicket = async (data: {
    title: string;
    description: string;
    created_by: string;
    priority?: string;
}) => {
    const result = await db.query(
        `
        INSERT INTO tickets (title, description, created_by, status, priority, type)
        VALUES ($1, $2, $3, 'OPEN', $4, 'TICKET')
        RETURNING *
        `,
        [data.title, data.description, data.created_by, data.priority || 'LOW'],
    );

    return result.rows[0];
};

export const assignTicket = async (ticketId: string, resolverId: string) => {
    const result = await db.query(
        `
        UPDATE tickets
        SET resolver_id = $1,
        updated_at = NOW(),
        status = 'ASSIGNED'
        WHERE id = $2
        RETURNING *;

        `,
        [resolverId, ticketId],
    );

    return result.rows[0];
};

export const changeTicketStatus = async (ticketId: string, ticketStatus: string) => {
    const result = await db.query(
        `
        UPDATE tickets
        SET status = $1,
        updated_at = NOW()
        WHERE id = $2
        RETURNING *
        `,
        [ticketStatus, ticketId],
    );

    return result.rows[0];
};

export const updateTicketPriority = async (ticketId: string, priority: string) => {
    const result = await db.query(
        `
        UPDATE tickets
        SET priority = $1,
        updated_at = NOW()
        WHERE id = $2
        RETURNING *
        `,
        [priority, ticketId],
    );

    return result.rows[0];
};

export const updateTicketType = async (ticketId: string, type: string) => {
    const result = await db.query(
        `
        UPDATE tickets
        SET type = $1,
        updated_at = NOW()
        WHERE id = $2
        RETURNING *
        `,
        [type, ticketId],
    );

    return result.rows[0];
};

export const findTicketsAssignedToUser = async (userId: string) => {
    const result = await db.query(
        `
        SELECT * 
        FROM tickets
        WHERE resolver_id = $1
        ORDER BY created_at DESC
        `,
        [userId],
    );

    return result.rows;
};

export const findTicketById = async (ticketId: string) => {
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
        ON t.resolver_id = r.id

    -- Join creator
    JOIN users u
        ON t.created_by = u.id

        WHERE t.id = $1
        ORDER BY t.created_at DESC
        `,
        [ticketId],
    );

    return result.rows[0];
};

export const findAllTickets = async () => {
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
        ON t.resolver_id = r.id

    -- Join creator
    JOIN users u
        ON t.created_by = u.id

    ORDER BY t.created_at DESC
       `,
    );

    return result.rows;
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
        ON t.resolver_id = r.id

    -- Join creator
    JOIN users u
        ON t.created_by = u.id

    WHERE t.created_by = $1

    ORDER BY t.created_at DESC
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
            'id', r.id,
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
          FROM tickets t
          LEFT JOIN users r
            ON t.resolver_id = r.id

          -- Join CreatedUser
          JOIN users u
            on t.created_by = u.id

          WHERE t.created_by = $1

          AND t.status IN ('CLOSED', 'VERIFIED', 'RESOLVED')

          ORDER BY t.created_at DESC
        `,
        [userId],
    );
    return result.rows;
};

export const getAssignedTickets = async (resolverId: string) => {
    const result = await db.query(
        `
    SELECT
      t.*,

      json_build_object(
          'id', r.id,
          'name', r.name,
          'email', r.email,
          'role', r.role
      ) AS resolver,

      json_build_object(
          'id', u.id,
          'name', u.name,
          'email', u.email,
          'role', u.role
      ) AS "createdUser"
       
    FROM tickets t
    JOIN users r ON t.resolver_id = r.id
    JOIN users u ON t.created_by = u.id
    WHERE t.resolver_id = $1
    ORDER BY t.created_at DESC
    `,
        [resolverId],
    );

    return result.rows;
};
