import { db } from '../../config/db';

// User Analytics
export const getTicketStatusStats = async (userId: string) => {
    const result = await db.query(
        `
        SELECT status, COUNT(*)::int as count
        FROM tickets
        WHERE created_by = $1
        GROUP BY status
        `,
        [userId]
    );
    return result.rows;
};

export const getTicketCreationStats = async (userId: string) => {
    const result = await db.query(
        `
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date as day, COUNT(*)::int as count
        FROM tickets
        WHERE created_by = $1
        GROUP BY 1
        ORDER BY 1 ASC
        `,
        [userId]
    );
    return result.rows;
};

export const getRawAverageResolutionTime = async (userId: string) => {
    const result = await db.query(
        `
        SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_seconds
        FROM tickets
        WHERE created_by = $1 AND status = 'CLOSED'
        `,
        [userId]
    );
    return result.rows[0];
};

// Manager Analytics
export const getManagerTicketStatusSummary = async () => {
    const result = await db.query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'OPEN') AS open,
            COUNT(*) FILTER (WHERE status = 'ASSIGNED') AS assigned,
            COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved,
            COUNT(*) FILTER (WHERE status = 'VERIFIED') AS verified,
            COUNT(*) FILTER (WHERE status = 'CLOSED') AS closed,
            COUNT(*) AS total
        FROM tickets
    `);
    return result.rows[0];
};

export const getTicketsPerResolver = async () => {
    const result = await db.query(`
        SELECT 
            u.id AS "resolverId",
            u.name AS "resolverName", 
            COUNT(t.*)::int AS "ticketCount"
        FROM users u
        LEFT JOIN tickets t ON t.resolver_id = u.id
        WHERE u.role = 'RESOLVER'
        GROUP BY u.id
    `);
    return result.rows;
};

export const getDailyTicketTrend = async () => {
    const result = await db.query(`
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int as count
        FROM tickets
        GROUP BY day
        ORDER BY day
    `);
    return result.rows;
};

export const getResolverPerformance = async () => {
    const result = await db.query(`
        SELECT 
            u.id AS "resolverId",
            u.name AS "resolverName",
            AVG(EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 86400) AS "avgResolutionDays"
        FROM users u
        LEFT JOIN tickets t ON t.resolver_id = u.id AND t.status='CLOSED'
        WHERE u.role='RESOLVER'
        GROUP BY u.id
    `);
    return result.rows;
};

export const getTicketAgingBuckets = async () => {
    const result = await db.query(`
        SELECT
            CASE
                WHEN AGE(NOW(), created_at) <= INTERVAL '2 days' THEN '0–2 days'
                WHEN AGE(NOW(), created_at) <= INTERVAL '7 days' THEN '3–7 days'
                ELSE '7+ days'
            END AS range,
            COUNT(*)::int as count
        FROM tickets
        WHERE status != 'CLOSED'
        GROUP BY range
    `);
    return result.rows;
};

// Admin Analytics
export const getUsersByRole = async () => {
    const result = await db.query(`
        SELECT role, COUNT(*)::int as count
        FROM users
        GROUP BY role
    `);
    return result.rows;
};

export const getActiveUserStats = async () => {
    const result = await db.query(`
        SELECT 
            COUNT(*) FILTER (WHERE is_active = true)::int as active,
            COUNT(*) FILTER (WHERE is_active = false)::int as inactive
        FROM users
    `);
    return result.rows[0];
};

export const getSignupTrend = async () => {
    const result = await db.query(`
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date as day, COUNT(*)::int as count
        FROM users
        GROUP BY 1
        ORDER BY 1 ASC
    `);
    return result.rows;
};

export const getTicketSummary = async () => {
    const result = await db.query(`
        SELECT COUNT(*)::int as "totalTickets"
        FROM tickets
    `);
    return result.rows[0];
};

export const getSystemActivityHeatmap = async () => {
    const result = await db.query(`
        SELECT
            TRIM(TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'Day')) as day,
            EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::int as hour,
            COUNT(*)::int as count
        FROM ticket_activity
        GROUP BY 1, 2
        ORDER BY day, hour
    `);
    return result.rows;
};

// Resolver Analytics
export const getResolverWorkload = async (resolverId: string) => {
    const result = await db.query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'ASSIGNED')::int as assigned,
            0 as "inProgress", -- Placeholder as IN_PROGRESS status doesn't strictly exist
            COUNT(*) FILTER (WHERE status = 'RESOLVED' AND (updated_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date)::int as "resolvedToday"
        FROM tickets
        WHERE resolver_id = $1::uuid
    `, [resolverId]);
    return result.rows[0];
};

export const getResolverResolutionTrend = async (resolverId: string) => {
    const result = await db.query(`
        SELECT 
            (created_at AT TIME ZONE 'Asia/Kolkata')::date as day, 
            COUNT(*)::int as resolved
        FROM ticket_activity
        WHERE type = 'TICKET_RESOLVED' AND performed_by = $1::uuid
        GROUP BY 1
        ORDER BY 1 ASC
    `, [resolverId]);
    return result.rows;
};

export const getResolverInflowOutflow = async (resolverId: string) => {
    // We combine two queries or use a CTE for full outer join on days
    const result = await db.query(`
        WITH inflow AS (
            SELECT 
                (created_at AT TIME ZONE 'Asia/Kolkata')::date as day, 
                COUNT(*)::int as count
            FROM ticket_activity
            WHERE type = 'TICKET_ASSIGNED' AND metadata->>'resolverId' = $1::text
            GROUP BY 1
        ),
        outflow AS (
            SELECT 
                (created_at AT TIME ZONE 'Asia/Kolkata')::date as day, 
                COUNT(*)::int as count
            FROM ticket_activity
            WHERE type = 'TICKET_RESOLVED' AND performed_by = $1::uuid
            GROUP BY 1
        )
        SELECT 
            COALESCE(i.day, o.day) as day, 
            COALESCE(i.count, 0) as inflow, 
            COALESCE(o.count, 0) as outflow
        FROM inflow i
        FULL OUTER JOIN outflow o ON i.day = o.day
        ORDER BY day ASC
    `, [resolverId]);
    return result.rows;
};

export const getResolverAvgResolutionTime = async (resolverId: string) => {
    // Calculated from tickets table for closed tickets
    const result = await db.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400) as "avgDays"
        FROM tickets
        WHERE resolver_id = $1::uuid AND status IN ('RESOLVED', 'CLOSED', 'VERIFIED')
    `, [resolverId]);
    return result.rows[0];
};


