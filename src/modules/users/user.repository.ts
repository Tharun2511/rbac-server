import { db } from '../../config/db';

export const createUser = async (data: { name: string; email: string; role: string }) => {
    const result = await db.query(
        `
        INSERT INTO users (name, email, role, is_active)
        VALUES ($1, $2, $3, false)
        RETURNING id, name, email, role, is_active
        `,
        [data.name, data.email, data.role],
    );

    return result.rows[0];
};

export const findAllUsers = async () => {
    const result = await db.query(`
        SELECT id, name, email, role, is_active
        FROM users
        ORDER BY name 
    `);

    return result.rows[0];
};

export const changeUserStatus = async (userId: string, isActive: boolean) => {
    const result = await db.query(
        `
        UPDATE users
        SET is_active = $1
        WHERE id = $2
        RETURNING id, name, email, role, is_active
    `,
        [userId, isActive],
    );

    return result.rows[0];
};

export const changeUserRole = async (userId: string, role: string) => {
    const result = await db.query(
        `
        UPDATE users
        SET role = $1
        WHERE id = $2
        RETURNING id, name, email, role, is_active
        `,
        [role, userId],
    );

    return result.rows[0];
};
