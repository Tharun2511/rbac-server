import { db } from '../../config/db';

export const createProject = async (name: string, slug: string, orgId: string) => {
    const result = await db.query(
        `INSERT INTO projects (name, slug, "orgId") VALUES ($1, $2, $3) RETURNING *`,
        [name, slug, orgId]
    );
    return result.rows[0];
};

export const getProjectsByOrg = async (orgId: string) => {
    const result = await db.query(
        `SELECT * FROM projects WHERE "orgId" = $1 ORDER BY name`, 
        [orgId]
    );
    return result.rows;
};

export const addMemberToProject = async (userId: string, orgId: string, projectId: string, roleId: string) => {
    const result = await db.query(
        `INSERT INTO members ("userId", "orgId", "projectId", "roleId") VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, orgId, projectId, roleId]
    );
    return result.rows[0];
};

export const getProjectMembers = async (projectId: string) => {
    const result = await db.query(
        `
        SELECT m.id, u.id as "userId", u.name, u.email, r.name as "roleName"
        FROM members m
        JOIN users u ON m."userId" = u.id
        JOIN roles r ON m."roleId" = r.id
        WHERE m."projectId" = $1
        `,
        [projectId]
    );
    return result.rows;
};

export const updateProject = async (id: string, name: string) => {
    const result = await db.query(
        `UPDATE projects SET name = $1 WHERE id = $2 RETURNING *`,
        [name, id]
    );
    return result.rows[0];
};

export const deleteProject = async (id: string) => {
    const result = await db.query(
        `DELETE FROM projects WHERE id = $1 RETURNING id`,
        [id]
    );
    return result.rows[0];
};

export const removeMemberFromProject = async (projectId: string, userId: string) => {
    const result = await db.query(
        `DELETE FROM members WHERE "projectId" = $1 AND "userId" = $2 RETURNING *`,
        [projectId, userId]
    );
    return result.rows[0];
};
