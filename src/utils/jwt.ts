import { env } from '../config/env';
import { AuthUser } from '../types/auth';
import jwt from 'jsonwebtoken';

export const signToken = (payload: AuthUser) => {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1d' });
};
