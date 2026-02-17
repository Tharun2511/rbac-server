import { db } from '../../config/db';

// ─── Create User ────────────────────────────────────────────────
export const createUser = async (data: {
    name: string;
    email: string;
    passwordHash: string;
    isSystemAdmin?: boolean;
}) => {
    const result = await db.query(
        `
        INSERT INTO users (name, email, "passwordHash", "isActive", "isSystemAdmin")
        VALUES ($1, $2, $3, true, $4)
        RETURNING id, name, email, "isActive", "isSystemAdmin", "createdAt"
        `,
        [data.name, data.email, data.passwordHash, data.isSystemAdmin || false],
    );
    return result.rows[0];
};

// ─── Find All Users (System-wide or Org-scoped) ────────────────
export const findAllUsers = async (orgId?: string) => {
    if (orgId) {
        // Return users who are members of this org with their role
        const result = await db.query(`
            SELECT DISTINCT
                u.id,
                u.name,
                u.email,
                u."isActive",
                u."isSystemAdmin",
                u."createdAt",
                r.name as role
            FROM users u
            JOIN members m ON m."userId" = u.id
            LEFT JOIN roles r ON m."roleId" = r.id
            WHERE m."orgId" = $1 AND m."projectId" IS NULL
            ORDER BY u.name
        `, [orgId]);
        return result.rows;
    }
    // System-wide: return all users (no role for system-wide view)
    const result = await db.query(`
        SELECT id, name, email, "isActive", "isSystemAdmin", "createdAt"
        FROM users
        ORDER BY name
    `);
    return result.rows;
};

// ─── Find Members by Role in Org/Project ────────────────────────
export const findMembersByRole = async (orgId: string, roleName: string, projectId?: string) => {
    let query = `
        SELECT u.id, u.name, u.email, u."isActive", r.name as "roleName"
        FROM members m
        JOIN users u ON m."userId" = u.id
        JOIN roles r ON m."roleId" = r.id
        WHERE m."orgId" = $1 AND r.name = $2
    `;
    const params: string[] = [orgId, roleName];

    if (projectId) {
        query += ` AND m."projectId" = $3`;
        params.push(projectId);
    }

    query += ` ORDER BY u.name`;

    const result = await db.query(query, params);
    return result.rows;
};

// ─── Change User Active Status ──────────────────────────────────
export const changeUserStatus = async (userId: string, isActive: boolean) => {
    const result = await db.query(
        `
        UPDATE users
        SET "isActive" = $1, "updatedAt" = NOW()
        WHERE id = $2
        RETURNING id, name, email, "isActive", "isSystemAdmin"
        `,
        [isActive, userId],
    );
    return result.rows[0];
};

// ─── Find User by ID ────────────────────────────────────────────
export const findUserById = async (userId: string) => {
    const result = await db.query(
        `SELECT id, name, email, "isActive", "isSystemAdmin", "createdAt"
         FROM users WHERE id = $1`,
        [userId],
    );
    return result.rows[0];
};

// ─── Find User by Email ─────────────────────────────────────────
export const findUserByEmail = async (email: string) => {
    const result = await db.query(
        `SELECT id, name, email, "passwordHash", "isActive", "isSystemAdmin"
         FROM users WHERE email = $1`,
        [email],
    );
    return result.rows[0];
};

// ─── Get User Memberships (Orgs + Projects + Roles) ─────────────
export const getUserMemberships = async (userId: string) => {
    const result = await db.query(`
        SELECT 
            m.id as "membershipId",
            m."orgId",
            o.name as "orgName",
            m."projectId",
            p.name as "projectName",
            r.name as "roleName",
            r.scope as "roleScope"
        FROM members m
        JOIN roles r ON m."roleId" = r.id
        LEFT JOIN organizations o ON m."orgId" = o.id
        LEFT JOIN projects p ON m."projectId" = p.id
        WHERE m."userId" = $1
        ORDER BY o.name, p.name
    `, [userId]);
    return result.rows;
};

// ─── Find Default Org-Scoped Role ───────────────────────────────
export const findDefaultOrgRole = async () => {
    const result = await db.query(
        `SELECT id FROM roles WHERE name = 'Organization Admin' AND scope = 'ORG' LIMIT 1`
    );
    return result.rows[0];
};

// ─── Add User to Org as Member ──────────────────────────────────
export const addUserToOrg = async (userId: string, orgId: string, roleId: string) => {
    const result = await db.query(
        `INSERT INTO members ("userId", "orgId", "roleId") VALUES ($1, $2, $3) RETURNING *`,
        [userId, orgId, roleId]
    );
    return result.rows[0];
};

// ─── Get Org Users Not In Project ───────────────────────────────
export const getOrgUsersNotInProject = async (orgId: string, projectId: string) => {
    const result = await db.query(`
        SELECT DISTINCT u.id, u.name, u.email
        FROM users u
        JOIN members m ON m."userId" = u.id
        WHERE m."orgId" = $1
          AND u."isActive" = true
          AND u.id NOT IN (
              SELECT m2."userId" FROM members m2 WHERE m2."projectId" = $2
          )
        ORDER BY u.name
    `, [orgId, projectId]);
    return result.rows;
};

// ─── Get Roles by Scope ─────────────────────────────────────────
export const findRolesByScope = async (scope: string) => {
    const result = await db.query(
        `SELECT id, name, scope FROM roles WHERE scope = $1 ORDER BY name`,
        [scope]
    );
    return result.rows;
};

