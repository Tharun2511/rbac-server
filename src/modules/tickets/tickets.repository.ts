import { db } from '../../config/db';

export const createTicket = async (data: {
    title: string;
    description: string;
    priority: string;
    type: string;
    orgId: string;
    projectId?: string;
    createdBy: string;
}) => {
    const result = await db.query(
        `
        INSERT INTO tickets (title, description, priority, type, "orgId", "projectId", "createdBy", status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')
        RETURNING *
        `,
        [data.title, data.description, data.priority, data.type, data.orgId, data.projectId, data.createdBy]
    );
    return result.rows[0];
};

export const getTickets = async (filter: { orgId: string, projectId?: string, resolverId?: string, createdBy?: string, userId?: string }) => {
    let query = `
        SELECT 
            t.*,
            u_created.name as "creatorName",
            u_created.email as "creatorEmail",
            u_resolver.name as "resolverName",
            u_resolver.email as "resolverEmail"
        FROM tickets t
        LEFT JOIN users u_created ON t."createdBy" = u_created.id
        LEFT JOIN users u_resolver ON t."resolverId" = u_resolver.id
        WHERE t."orgId" = $1
    `;
    const params: any[] = [filter.orgId];
    let paramIdx = 2;

    if (filter.projectId) {
        query += ` AND t."projectId" = $${paramIdx++}`;
        params.push(filter.projectId);
    }
    
    if (filter.resolverId) {
        query += ` AND t."resolverId" = $${paramIdx++}`;
        params.push(filter.resolverId);
    }

    if (filter.createdBy) {
        query += ` AND t."createdBy" = $${paramIdx++}`;
        params.push(filter.createdBy);
    }

    // userId: match tickets where user is either creator OR resolver
    if (filter.userId) {
        query += ` AND (t."createdBy" = $${paramIdx} OR t."resolverId" = $${paramIdx})`;
        params.push(filter.userId);
        paramIdx++;
    }

    query += ` ORDER BY t."createdAt" DESC`;

    const result = await db.query(query, params);
    return result.rows;
};

export const getTicketById = async (ticketId: string, orgId: string) => {
    // Ensure we scope by orgId to prevent leaking other org tickets if ID is guessed (UUID is hard to guess but safe practice)
    const result = await db.query(
        `
        SELECT 
            t.*,
            u_created.name as "creatorName",
            u_created.email as "creatorEmail",
            u_resolver.name as "resolverName",
            u_resolver.email as "resolverEmail"
        FROM tickets t
        LEFT JOIN users u_created ON t."createdBy" = u_created.id
        LEFT JOIN users u_resolver ON t."resolverId" = u_resolver.id
        WHERE t.id = $1 AND t."orgId" = $2
        `,
        [ticketId, orgId]
    );
    return result.rows[0];
};

// Internal use: get ticket without org scoping (for comparing old state in activity logging)
export const getTicketByIdOnly = async (ticketId: string) => {
    const result = await db.query(`SELECT * FROM tickets WHERE id = $1`, [ticketId]);
    return result.rows[0];
};

export const updateTicket = async (ticketId: string, updates: any) => {
    // Dynamic update
    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of Object.keys(updates)) {
        fields.push(`"${key}" = $${idx++}`);
        values.push(updates[key]);
    }
    values.push(ticketId); // Last param is ID

    const result = await db.query(
        `UPDATE tickets SET ${fields.join(', ')}, "updatedAt" = NOW() WHERE id = $${idx} RETURNING *`,
        values
    );
    return result.rows[0];
};
