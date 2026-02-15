import { db } from '../../config/db';

export const getTicketStats = async (orgId?: string, userId?: string, projectId?: string) => {
    let query = `
        SELECT 
            COUNT(*) FILTER (WHERE status = 'OPEN') as "openTickets",
            COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as "inProgressTickets",
            COUNT(*) FILTER (WHERE status = 'RESOLVED') as "resolvedTickets",
            COUNT(*) FILTER (WHERE status = 'CLOSED') as "closedTickets",
            COUNT(*) as "totalTickets"
        FROM tickets
    `;
    const conditions: string[] = [];
    const params: string[] = [];

    if (orgId) {
        params.push(orgId);
        conditions.push(`"orgId" = $${params.length}`);
    }

    if (userId) {
        params.push(userId);
        conditions.push(`("createdBy" = $${params.length} OR "resolverId" = $${params.length})`);
    }

    if (projectId) {
        params.push(projectId);
        conditions.push(`"projectId" = $${params.length}`);
    }

    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await db.query(query, params);
    const row = result.rows[0];
    return {
        openTickets: parseInt(row.openTickets || '0'),
        inProgressTickets: parseInt(row.inProgressTickets || '0'),
        resolvedTickets: parseInt(row.resolvedTickets || '0'),
        closedTickets: parseInt(row.closedTickets || '0'),
        totalTickets: parseInt(row.totalTickets || '0')
    };
};

export const getTicketsByPriority = async (orgId?: string, projectId?: string) => {
    let query = `SELECT priority, COUNT(*)::int as count FROM tickets`;
    const conditions: string[] = [];
    const params: string[] = [];
    if (orgId) {
        params.push(orgId);
        conditions.push(`"orgId" = $${params.length}`);
    }
    if (projectId) {
        params.push(projectId);
        conditions.push(`"projectId" = $${params.length}`);
    }
    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ` GROUP BY priority`;
    const result = await db.query(query, params);
    return result.rows;
};

export const getTicketsByStatus = async (orgId?: string, projectId?: string) => {
    let query = `SELECT status, COUNT(*)::int as count FROM tickets`;
    const conditions: string[] = [];
    const params: string[] = [];
    if (orgId) {
        params.push(orgId);
        conditions.push(`"orgId" = $${params.length}`);
    }
    if (projectId) {
        params.push(projectId);
        conditions.push(`"projectId" = $${params.length}`);
    }
    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ` GROUP BY status`;
    const result = await db.query(query, params);
    return result.rows;
};
