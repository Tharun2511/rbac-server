import { db } from '../../config/db';
import { User } from '../../types/users';

export const findUserByEmail = async (email: string): Promise<User> => {
    const result = await db.query(
        `SELECT id, email, password_hash, role, is_active 
          FROM users 
          WHERE email = $1`,
        [email],
    );

    return result.rows[0];
};
