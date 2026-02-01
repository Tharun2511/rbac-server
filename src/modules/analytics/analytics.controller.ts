import { Request, Response } from 'express';
import * as analyticsService from './analytics.service';

export const getUserAnalytics = async (req: Request, res: Response) => {
    try {
        // req.user is populated by authenticate middleware
        // @ts-ignore - assuming req.user exists from middleware
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const data = await analyticsService.getUserAnalytics(userId);
        return res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching user analytics:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getManagerAnalytics = async (req: Request, res: Response) => {
    try {
        const data = await analyticsService.getManagerAnalytics();
        return res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching manager analytics:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAdminAnalytics = async (req: Request, res: Response) => {
    try {
        const data = await analyticsService.getAdminAnalytics();
        return res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching admin analytics:', error);
        return res.status(500).json({ message: 'Error fetching admin analytics', error });
    }
};

export const getResolverAnalytics = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const data = await analyticsService.getResolverAnalytics(userId);
        return res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching resolver analytics:', error);
        return res.status(500).json({ message: 'Error fetching resolver analytics', error });
    }
};
