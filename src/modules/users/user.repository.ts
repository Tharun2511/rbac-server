import { db } from '../../config/db';

export const createUser = async (data: {
    name: string;
    email: string;
    role: string;
    hashPassword: string;
}) => {
    const result = await db.query(
        `
        INSERT INTO users (name, email, role, is_active, password_hash)
        VALUES ($1, $2, $3, false, $4)
        RETURNING id, name, email, role, is_active
        `,
        [data.name, data.email, data.role, data.hashPassword],
    );

    return result.rows[0];
};

export const findAllUsers = async () => {
    const result = await db.query(`
        SELECT id, email, role, is_active
        FROM users
        ORDER BY email 
    `);

    return result.rows;
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

export const findUserById = async (userId: string) => {
    const result = await db.query(
        `
        SELECT *
        FROM users
        WHERE id = $1
        `,
        [userId],
    );

    return result.rows[0];
};
