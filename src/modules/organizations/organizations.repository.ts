import { db } from '../../config/db';

export const createOrganization = async (name: string, slug: string) => {
    const result = await db.query(
        `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING *`,
        [name, slug]
    );
    return result.rows[0];
};

export const getOrganizationById = async (id: string) => {
    const result = await db.query(`SELECT * FROM organizations WHERE id = $1`, [id]);
    return result.rows[0];
};

export const getAllOrganizations = async () => {
    const result = await db.query(`SELECT * FROM organizations ORDER BY name`);
    return result.rows;
};

export const addMemberToOrganization = async (userId: string, orgId: string, roleId: string) => {
    const result = await db.query(
        `INSERT INTO members ("userId", "orgId", "roleId") VALUES ($1, $2, $3) RETURNING *`,
        [userId, orgId, roleId]
    );
    return result.rows[0];
};

export const getOrganizationMembers = async (orgId: string) => {
    const result = await db.query(
        `
        SELECT m.id, u.name, u.email, r.name as "roleName"
        FROM members m
        JOIN users u ON m."userId" = u.id
        JOIN roles r ON m."roleId" = r.id
        WHERE m."orgId" = $1 AND m."projectId" IS NULL
        `,
        [orgId]
    );
    return result.rows;
};
