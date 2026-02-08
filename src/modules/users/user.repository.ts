import { db } from '../../config/db';
import { User } from '../../types/users';

export const createUser = async (data: {
    name: string;
    email: string;
    role: string;
    password: string;
}) => {
    const result = await db.query(
        `
        INSERT INTO users (name, email, role, is_active, password)
        VALUES ($1, $2, $3, false, $4)
        RETURNING id, name, email, role, is_active, created_at, updated_at
        `,
        [data.name, data.email, data.role, data.password],
    );

    return result.rows[0];
};

export const findAllUsers = async () => {
    const result = await db.query(`
        SELECT id, name, email, role, is_active, created_at
        FROM users
        ORDER BY name 
    `);

    return result.rows;
};

export const findAllResolvers = async () => {
    const result = await db.query(`
        SELECT id, name, role, is_active
        FROM users
        WHERE role='RESOLVER'
        ORDER BY name
    `);

    return result.rows;
};

export const changeUserStatus = async (userId: string, isActive: boolean) => {
    const result = await db.query(
        `
        UPDATE users
        SET is_active = $1,
        updated_at = NOW()
        WHERE id = $2
        RETURNING id, name, email, role, is_active
    `,
        [isActive, userId],
    );

    return result.rows[0];
};

export const changeUserRole = async (userId: string, role: string) => {
    const result = await db.query(
        `
        UPDATE users
        SET role = $1,
        updated_at = NOW()
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

export const findUserByEmail = async (email: string): Promise<User> => {
    const result = await db.query(
        `
        SELECT id, name, email, password, is_active 
        FROM users 
        WHERE email = $1`,
        [email],
    );

    return result.rows[0];
};
