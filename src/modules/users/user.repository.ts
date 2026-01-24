import { db } from '../../config/db';
import { User } from '../../types/users';

export const createUser = async (data: {
    name: string;
    email: string;
    role: string;
    passwordHash: string;
}) => {
    const result = await db.query(
        `
        INSERT INTO users (name, email, role, "isActive", "passwordHash")
        VALUES ($1, $2, $3, false, $4)
        RETURNING id, name, email, role, "isActive"
        `,
        [data.name, data.email, data.role, data.passwordHash],
    );

    return result.rows[0];
};

export const findAllUsers = async () => {
    const result = await db.query(`
        SELECT id, name, email, role, "isActive"
        FROM users
        ORDER BY name 
    `);

    return result.rows;
};

export const findAllResolvers = async () => {
    const result = await db.query(`
        SELECT id, name, role, "isActive"
        FROM users
        WHERE role="RESOLVER"
        ORDER BY name
    `);

    return result.rows[0];
};

export const changeUserStatus = async (userId: string, isActive: boolean) => {
    const result = await db.query(
        `
        UPDATE users
        SET "isActive" = $1
        WHERE id = $2
        RETURNING id, name, email, role, "isActive"
    `,
        [isActive, userId],
    );

    return result.rows[0];
};

export const changeUserRole = async (userId: string, role: string) => {
    const result = await db.query(
        `
        UPDATE users
        SET role = $1
        WHERE id = $2
        RETURNING id, name, email, role, "isActive"
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

export const findUserByEmail = async (email: string): Promise<User> => {
    const result = await db.query(
        `
        SELECT id, name, email, "passwordHash", role, "isActive" 
        FROM users 
        WHERE email = $1`,
        [email],
    );

    return result.rows[0];
};
