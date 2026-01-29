import { signToken } from '../../utils/jwt';
import { passwordCompare } from '../../utils/password';
import { findUserByEmail } from '../users/user.repository';

export const login = async (email: string, password: string) => {
    const userDetails = await findUserByEmail(email);

    if (!userDetails || !userDetails.isActive) throw new Error('Invalid Credentials');

    const passwordMatch = await passwordCompare(password, userDetails.passwordHash);

    if (!passwordMatch) throw new Error('Invalid Credentials');

    const token = signToken({ userId: userDetails.id, role: userDetails.role });

    return {
        user: {
            id: userDetails.id,
            email: userDetails.email,
            role: userDetails.role,
            name: userDetails.name,
        },
        token,
    };
};
