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

// System Admin Analytics Queries

export const getSystemOrgStats = async () => {
    const result = await db.query(`
        SELECT
            COUNT(DISTINCT o.id)::int as "totalOrgs",
            COUNT(DISTINCT m."userId")::int as "totalUsers",
            COUNT(DISTINCT p.id)::int as "totalProjects",
            COUNT(DISTINCT CASE WHEN u."isActive" = true THEN u.id END)::int as "activeUsers",
            COUNT(DISTINCT CASE WHEN u."isActive" = false THEN u.id END)::int as "inactiveUsers"
        FROM organizations o
        LEFT JOIN projects p ON p."orgId" = o.id
        LEFT JOIN members m ON m."orgId" = o.id
        LEFT JOIN users u ON u.id = m."userId"
    `);
    return result.rows[0];
};

export const getMemberDistribution = async () => {
    const result = await db.query(`
        SELECT
            o.id,
            o.name,
            o.slug,
            COUNT(DISTINCT m."userId")::int as "memberCount"
        FROM organizations o
        LEFT JOIN members m ON m."orgId" = o.id
        GROUP BY o.id, o.name, o.slug
        ORDER BY "memberCount" DESC, o.name
    `);
    return result.rows;
};

export const getOrgCreationTimeline = async () => {
    const result = await db.query(`
        SELECT
            DATE("createdAt") as date,
            COUNT(*)::int as count
        FROM organizations
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
    `);
    return result.rows;
};

export const getRoleDistribution = async () => {
    const result = await db.query(`
        SELECT
            r.name as role,
            COUNT(DISTINCT m."userId")::int as count
        FROM members m
        JOIN roles r ON m."roleId" = r.id
        GROUP BY r.name
        ORDER BY count DESC
    `);
    return result.rows;
};

// --- New Queries for Org-Specific System Admin/Org Owner Views ---

export const getSLACompliance = async (orgId: string) => {
    const query = `
        SELECT
            CASE
                WHEN EXTRACT(DAY FROM (t."updatedAt" - t."createdAt")) <= 7 THEN 'Within SLA (<7 days)'
                ELSE 'Breached SLA (7+ days)'
            END as "slaStatus",
            COUNT(*)::int as count
        FROM tickets t
        WHERE t."orgId" = $1
        AND t.status IN ('RESOLVED', 'CLOSED')
        GROUP BY "slaStatus"
    `;

    const result = await db.query(query, [orgId]);
    return result.rows;
};

export const getResourceAllocation = async (orgId: string) => {
    const query = `
        SELECT
            p.name as "projectName",
            COUNT(DISTINCT m."userId")::int as "agentCount"
        FROM projects p
        LEFT JOIN members m ON m."projectId" = p.id
        WHERE p."orgId" = $1
        GROUP BY p.name
        ORDER BY "agentCount" DESC
    `;

    const result = await db.query(query, [orgId]);
    return result.rows;
};

// PROJECT_MANAGER Analytics Queries

export const getTeamPerformanceMetrics = async (projectId: string, days: number = 30) => {
    const query = `
        SELECT
            t."resolverId" as "agentId",
            u.name as "agentName",
            COUNT(*) FILTER (WHERE t.status IN ('RESOLVED', 'CLOSED'))::int as "resolved",
            COUNT(*) FILTER (WHERE t.status = 'IN_PROGRESS')::int as "inProgress",
            COUNT(*) FILTER (WHERE t.status = 'ASSIGNED')::int as "assigned",
            ROUND(AVG(
                CASE
                    WHEN t.status IN ('RESOLVED', 'CLOSED')
                    THEN EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")) / 86400
                    ELSE NULL
                END
            )::numeric, 2) as "avgResolutionDays"
        FROM tickets t
        JOIN users u ON t."resolverId" = u.id
        WHERE t."projectId" = $1
        AND t."resolverId" IS NOT NULL
        AND t."createdAt" >= NOW() - INTERVAL '${days} days'
        GROUP BY t."resolverId", u.name
        ORDER BY "resolved" DESC
    `;

    const result = await db.query(query, [projectId]);
    return result.rows;
};

export const getTeamWorkloadDistribution = async (projectId: string) => {
    const query = `
        SELECT
            t."resolverId" as "agentId",
            u.name as "agentName",
            COUNT(*) FILTER (WHERE t.status = 'ASSIGNED')::int as "assigned",
            COUNT(*) FILTER (WHERE t.status = 'IN_PROGRESS')::int as "inProgress",
            COUNT(*)::int as "total"
        FROM tickets t
        JOIN users u ON t."resolverId" = u.id
        WHERE t."projectId" = $1
        AND t.status IN ('ASSIGNED', 'IN_PROGRESS')
        AND t."resolverId" IS NOT NULL
        GROUP BY t."resolverId", u.name
        ORDER BY "total" DESC
    `;

    const result = await db.query(query, [projectId]);
    return result.rows;
};

export const getTicketAgingBuckets = async (projectId: string) => {
    const query = `
        SELECT
            CASE
                WHEN EXTRACT(DAY FROM (NOW() - t."createdAt")) <= 2 THEN '0-2 days'
                WHEN EXTRACT(DAY FROM (NOW() - t."createdAt")) <= 7 THEN '3-7 days'
                ELSE '7+ days'
            END as "ageBucket",
            COUNT(*)::int as count
        FROM tickets t
        WHERE t."projectId" = $1
        AND t.status NOT IN ('RESOLVED', 'CLOSED')
        GROUP BY "ageBucket"
        ORDER BY
            CASE "ageBucket"
                WHEN '0-2 days' THEN 1
                WHEN '3-7 days' THEN 2
                ELSE 3
            END
    `;

    const result = await db.query(query, [projectId]);
    return result.rows;
};

export const getTicketTypeDistribution = async (projectId: string) => {
    const query = `
        SELECT
            type as label,
            COUNT(*)::int as value
        FROM tickets
        WHERE "projectId" = $1
        GROUP BY type
        ORDER BY value DESC
    `;
    const result = await db.query(query, [projectId]);
    return result.rows;
};

export const getInflowOutflowTrend = async (projectId: string, days: number = 30) => {
    const query = `
        WITH date_series AS (
            SELECT generate_series(
                CURRENT_DATE - INTERVAL '${days} days',
                CURRENT_DATE,
                '1 day'::interval
            )::date as date
        ),
        created_tickets AS (
            SELECT
                DATE(t."createdAt") as date,
                COUNT(*)::int as inflow
            FROM tickets t
            WHERE t."projectId" = $1
            AND t."createdAt" >= CURRENT_DATE - INTERVAL '${days} days'
            GROUP BY DATE(t."createdAt")
        ),
        resolved_tickets AS (
            SELECT
                DATE(t."updatedAt") as date,
                COUNT(*)::int as outflow
            FROM tickets t
            WHERE t."projectId" = $1
            AND t.status IN ('RESOLVED', 'CLOSED')
            AND t."updatedAt" >= CURRENT_DATE - INTERVAL '${days} days'
            GROUP BY DATE(t."updatedAt")
        )
        SELECT
            ds.date::text,
            COALESCE(ct.inflow, 0) as inflow,
            COALESCE(rt.outflow, 0) as outflow
        FROM date_series ds
        LEFT JOIN created_tickets ct ON ds.date = ct.date
        LEFT JOIN resolved_tickets rt ON ds.date = rt.date
        ORDER BY ds.date ASC
    `;

    const result = await db.query(query, [projectId]);
    return result.rows;
};

// AGENT Analytics Queries

export const getAgentProductivity = async (userId: string, orgId: string) => {
    const query = `
        WITH today_stats AS (
            SELECT
                COUNT(*) FILTER (
                    WHERE status IN ('RESOLVED', 'CLOSED')
                    AND DATE("updatedAt") = CURRENT_DATE
                )::int as "resolvedToday"
            FROM tickets
            WHERE "resolverId" = $1 AND "orgId" = $2
        ),
        week_stats AS (
            SELECT
                COUNT(*) FILTER (
                    WHERE status IN ('RESOLVED', 'CLOSED')
                    AND "updatedAt" >= CURRENT_DATE - INTERVAL '7 days'
                )::int as "resolvedThisWeek"
            FROM tickets
            WHERE "resolverId" = $1 AND "orgId" = $2
        ),
        current_workload AS (
            SELECT
                COUNT(*) FILTER (WHERE status = 'ASSIGNED')::int as "assigned",
                COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int as "inProgress"
            FROM tickets
            WHERE "resolverId" = $1 AND "orgId" = $2
        )
        SELECT
            ts."resolvedToday",
            ws."resolvedThisWeek",
            cw."assigned",
            cw."inProgress"
        FROM today_stats ts, week_stats ws, current_workload cw
    `;

    const result = await db.query(query, [userId, orgId]);
    return result.rows[0];
};

export const getAgentAvgResolutionTime = async (userId: string, orgId?: string) => {
    let query = `
        SELECT
            COUNT(*)::int as "resolvedCount",
            ROUND(AVG(EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")) / 86400)::numeric, 2) as "avgDays"
        FROM tickets t
        WHERE t."resolverId" = $1
        AND t.status IN ('RESOLVED', 'CLOSED')
    `;
    const params: string[] = [userId];

    if (orgId) {
        params.push(orgId);
        query += ` AND t."orgId" = $${params.length}`;
    }

    const result = await db.query(query, params);
    return result.rows[0];
};

export const getAgentVelocityTrend = async (userId: string, orgId: string, days: number = 30) => {
    const query = `
        SELECT
            DATE("updatedAt") as date,
            COUNT(*)::int as "resolved"
        FROM tickets
        WHERE "resolverId" = $1
        AND "orgId" = $2
        AND status IN ('RESOLVED', 'CLOSED')
        AND "updatedAt" >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY DATE("updatedAt")
        ORDER BY date ASC
    `;

    const result = await db.query(query, [userId, orgId]);
    return result.rows;
};

export const getAgentInflowOutflow = async (userId: string, orgId: string, days: number = 14) => {
    const query = `
        WITH date_series AS (
            SELECT generate_series(
                CURRENT_DATE - INTERVAL '${days} days',
                CURRENT_DATE,
                '1 day'::interval
            )::date as date
        ),
        assigned_tickets AS (
            SELECT
                DATE("createdAt") as date,
                COUNT(*)::int as inflow
            FROM tickets
            WHERE "resolverId" = $1
            AND "orgId" = $2
            AND "createdAt" >= CURRENT_DATE - INTERVAL '${days} days'
            GROUP BY DATE("createdAt")
        ),
        resolved_tickets AS (
            SELECT
                DATE("updatedAt") as date,
                COUNT(*)::int as outflow
            FROM tickets
            WHERE "resolverId" = $1
            AND "orgId" = $2
            AND status IN ('RESOLVED', 'CLOSED')
            AND "updatedAt" >= CURRENT_DATE - INTERVAL '${days} days'
            GROUP BY DATE("updatedAt")
        )
        SELECT
            ds.date::text,
            COALESCE(at.inflow, 0) as inflow,
            COALESCE(rt.outflow, 0) as outflow
        FROM date_series ds
        LEFT JOIN assigned_tickets at ON ds.date = at.date
        LEFT JOIN resolved_tickets rt ON ds.date = rt.date
        ORDER BY ds.date ASC
    `;

    const result = await db.query(query, [userId, orgId]);
    return result.rows;
};

export const getMyTasksDue = async (userId: string, orgId: string) => {
    const query = `
        SELECT 
            priority,
            CASE
                WHEN EXTRACT(DAY FROM (NOW() - "createdAt")) <= 2 THEN '0-2 days'
                WHEN EXTRACT(DAY FROM (NOW() - "createdAt")) <= 7 THEN '3-7 days'
                ELSE '7+ days'
            END as "ageBucket",
            COUNT(*)::int as count
        FROM tickets
        WHERE "resolverId" = $1 
        AND "orgId" = $2
        AND status IN ('OPEN', 'IN_PROGRESS', 'ASSIGNED')
        GROUP BY priority, "ageBucket"
    `;

    const result = await db.query(query, [userId, orgId]);
    return result.rows;
};

// REQUESTER Analytics Queries

export const getRequesterTurnaroundTime = async (userId: string, orgId: string) => {
    const query = `
        SELECT
            COUNT(*) FILTER (WHERE status IN ('RESOLVED', 'CLOSED'))::int as "completedTickets",
            ROUND(AVG(
                CASE
                    WHEN status IN ('RESOLVED', 'CLOSED')
                    THEN EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")) / 86400
                    ELSE NULL
                END
            )::numeric, 2) as "avgTurnaroundDays"
        FROM tickets t
        WHERE t."createdBy" = $1
        AND t."orgId" = $2
    `;

    const result = await db.query(query, [userId, orgId]);
    return result.rows[0];
};

export const getRequesterRecentActivity = async (userId: string, orgId: string, limit: number = 10) => {
    const query = `
        SELECT
            ta.id,
            ta.type,
            ta."ticketId",
            t.title as "ticketTitle",
            ta."performedBy",
            u.name as "performedByName",
            ta.metadata,
            ta."createdAt"
        FROM ticket_activity ta
        JOIN tickets t ON ta."ticketId" = t.id
        JOIN users u ON ta."performedBy" = u.id
        WHERE t."createdBy" = $1
        AND t."orgId" = $2
        AND ta."performedBy" != $1
        ORDER BY ta."createdAt" DESC
        LIMIT $3
    `;

    const result = await db.query(query, [userId, orgId, limit]);
    return result.rows;
};

// ORG_OWNER Analytics Queries

export const getCrossProjectPerformance = async (orgId: string) => {
    const query = `
        SELECT
            p.id as "projectId",
            p.name as "projectName",
            COUNT(*)::int as "totalTickets",
            COUNT(*) FILTER (WHERE t.status = 'OPEN')::int as "open",
            COUNT(*) FILTER (WHERE t.status IN ('RESOLVED', 'CLOSED'))::int as "resolved",
            ROUND(AVG(
                CASE
                    WHEN t.status IN ('RESOLVED', 'CLOSED')
                    THEN EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")) / 86400
                    ELSE NULL
                END
            )::numeric, 2) as "avgResolutionDays",
            COUNT(DISTINCT t."resolverId")::int as "activeAgents"
        FROM projects p
        LEFT JOIN tickets t ON p.id = t."projectId"
        WHERE p."orgId" = $1
        GROUP BY p.id, p.name
        ORDER BY "totalTickets" DESC
    `;

    const result = await db.query(query, [orgId]);
    return result.rows;
};

export const getOrgTopPerformers = async (orgId: string, days: number = 30) => {
    const query = `
        SELECT
            u.id as "userId",
            u.name as "userName",
            COUNT(*)::int as "ticketsResolved",
            ROUND(AVG(EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")) / 86400)::numeric, 2) as "avgResolutionDays"
        FROM tickets t
        JOIN users u ON t."resolverId" = u.id
        WHERE t."orgId" = $1
        AND t.status IN ('RESOLVED', 'CLOSED')
        AND t."updatedAt" >= NOW() - INTERVAL '${days} days'
        GROUP BY u.id, u.name
        HAVING COUNT(*) >= 5
        ORDER BY "ticketsResolved" DESC, "avgResolutionDays" ASC
        LIMIT 10
    `;

    const result = await db.query(query, [orgId]);
    return result.rows;
};

export const getBottleneckAnalysis = async (orgId: string) => {
    const query = `
        SELECT
            p.id as "projectId",
            p.name as "projectName",
            COUNT(*) FILTER (
                WHERE t.status NOT IN ('RESOLVED', 'CLOSED')
                AND EXTRACT(DAY FROM (NOW() - t."createdAt")) > 7
            )::int as "staleTickets",
            COUNT(*) FILTER (WHERE t.status = 'OPEN')::int as "unassignedTickets",
            ROUND(AVG(
                CASE
                    WHEN t.status NOT IN ('RESOLVED', 'CLOSED')
                    THEN EXTRACT(DAY FROM (NOW() - t."createdAt"))
                    ELSE NULL
                END
            )::numeric, 1) as "avgOpenAge"
        FROM projects p
        LEFT JOIN tickets t ON p.id = t."projectId"
        WHERE p."orgId" = $1
        GROUP BY p.id, p.name
        HAVING COUNT(*) FILTER (WHERE t.status NOT IN ('RESOLVED', 'CLOSED')) > 0
        ORDER BY "staleTickets" DESC, "avgOpenAge" DESC
    `;

    const result = await db.query(query, [orgId]);
    return result.rows;
};
