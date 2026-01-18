import { db } from '../../config/db';
import { User } from '../../types/users';

export const findUserByEmail = async (email: string): Promise<User> => {
    const result = await db.query(
        `SELECT id, name, email, "passwordHash", role, "isActive" 
          FROM users 
          WHERE email = $1`,
        [email],
    );

    return result.rows[0];
};
