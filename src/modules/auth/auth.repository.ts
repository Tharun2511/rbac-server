import { db } from '../../config/db';

export const findUserByEmail = async (email: string) => {
    const result = await db.query(
        `SELECT id, email, hashed_password, role, is_active 
          FROM users 
          WHERE email = $1`,
        [email],
    );

    return result.rows[0];
};
