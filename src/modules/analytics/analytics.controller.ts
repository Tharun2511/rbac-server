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

export const getSystemAdminAnalytics = async (req: Request, res: Response) => {
    const isSystemAdmin = (req as any).isSystemAdmin;

    if (!isSystemAdmin) {
        return res.status(403).json({ message: 'System admin access required' });
    }

    try {
        const data = await analyticsService.getSystemAdminAnalytics();
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch system admin analytics' });
    }
};

export const getProjectManagerAnalytics = async (req: Request, res: Response) => {
    const projectId = req.headers['x-project-id'] as string;

    if (!projectId) {
        return res.status(400).json({ message: 'Project context required' });
    }

    try {
        const data = await analyticsService.getProjectManagerAnalytics(projectId);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch project manager analytics' });
    }
};

export const getAgentAnalytics = async (req: Request, res: Response) => {
    const orgId = req.headers['x-org-id'] as string;
    const userId = req.user?.userId;

    if (!userId || !orgId) {
        return res.status(400).json({ message: 'User and organization context required' });
    }

    try {
        const data = await analyticsService.getAgentAnalytics(userId, orgId);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch agent analytics' });
    }
};

export const getRequesterAnalytics = async (req: Request, res: Response) => {
    const orgId = req.headers['x-org-id'] as string;
    const userId = req.user?.userId;

    if (!userId || !orgId) {
        return res.status(400).json({ message: 'User and organization context required' });
    }

    try {
        const data = await analyticsService.getRequesterAnalytics(userId, orgId);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch requester analytics' });
    }
};

export const getOrgOwnerAnalytics = async (req: Request, res: Response) => {
    const orgId = req.headers['x-org-id'] as string;

    if (!orgId) {
        return res.status(400).json({ message: 'Organization context required' });
    }

    try {
        const data = await analyticsService.getOrgOwnerAnalytics(orgId);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch org owner analytics' });
    }
};
