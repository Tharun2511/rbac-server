import { signToken } from '../../utils/jwt';
import { passwordCompare } from '../../utils/password';
import { findUserByEmail } from '../users/user.repository';
import crypto from "crypto";
import * as authRepository from './auth.repository';

export const login = async (email: string, password: string) => {
    const userDetails = await findUserByEmail(email);

    if (!userDetails || !userDetails.isActive) throw new Error('Invalid Credentials');

    const passwordMatch = await passwordCompare(password, userDetails.passwordHash);

    if (!passwordMatch) throw new Error('Invalid Credentials');

    const token = signToken({ userId: userDetails.id, role: userDetails.role, name: userDetails.name });

    const refreshToken = generateRefreshToken();
    await authRepository.updateRefreshToken(userDetails.id, refreshToken);

    return {
        user: {
            id: userDetails.id,
            email: userDetails.email,
            role: userDetails.role,
            name: userDetails.name,
        },
        token,
        refreshToken
    };
};

export function hashRefreshToken(refreshToken: string) {
    return crypto.createHash("sha256").update(refreshToken).digest("hex");
}

export function generateRefreshToken() {
    return hashRefreshToken(crypto.randomBytes(40).toString("hex"));
}

export async function getUserByRefreshToken (refreshToken: string) {
    return await authRepository.findUserByRefreshToken(refreshToken);
}
