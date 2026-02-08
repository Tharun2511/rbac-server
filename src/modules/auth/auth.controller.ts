import { Request, Response } from 'express';
import * as authService from './auth.service';
import { updateRefreshToken } from './auth.repository';
import { generateRefreshToken, hashRefreshToken } from './auth.service';
import { signToken } from '../../utils/jwt';
import logger from '../../utils/logger';

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    logger.info(`Login attempt for user: ${email} and password: ${password}`);
    
    if (!email || !password)
        return res.status(400).json({ message: 'Email and Password are required' });
    
    try {
        const result = await authService.login(email, password);
        
        // Remove refreshToken from response body but keep it for cookie
        const { refreshToken, ...responseBody } = result;
        
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "strict",
            path: "/auth/refresh",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days    
        });

        return res.status(200).json(responseBody);


    } catch(err) {
        return res.status(401).json({ message: 'Invalid Credentials', error: err });
    }
};

export const logout = async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    await updateRefreshToken(userId, null);
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/auth/refresh',
    });
    return res.status(200).json({ message: 'Logged out successfully' });
};

export const refreshToken = async(req:Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;
    if(!refreshToken) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const user = await authService.getUserByRefreshToken(refreshToken);
        if(!user) return res.status(401).json({ message: 'Unauthorized' });
        const newAccessToken = signToken({ userId: user.id, role: user.role, name: user.name });

        const newRefreshToken = generateRefreshToken();
        await updateRefreshToken(user.id, hashRefreshToken(newRefreshToken));

        // Rotate the refresh token
        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "strict",
            path: "/auth/refresh", 
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days    
        });
        return res.status(200).json({ accessToken: newAccessToken, user: {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
        } });
    } catch {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    
}
