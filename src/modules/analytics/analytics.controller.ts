import { Request, Response } from 'express';
import * as analyticsService from './analytics.service';

export const getOrgAnalytics = async (req: Request, res: Response) => {
    const orgId = req.headers['x-org-id'] as string;
    const projectId = req.headers['x-project-id'] as string;
    const isSystemAdmin = (req as any).isSystemAdmin;

    if (!orgId && !isSystemAdmin) {
        return res.status(400).json({ message: 'Organization context required' });
    }

    try {
        const data = await analyticsService.getOrgAnalytics(orgId || undefined, projectId || undefined);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch analytics' });
    }
};

export const getMyAnalytics = async (req: Request, res: Response) => {
    const orgId = req.headers['x-org-id'] as string;
    const userId = req.user?.userId;
    
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const data = await analyticsService.getMyAnalytics(orgId || undefined, userId);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch user analytics' });
    }
};
