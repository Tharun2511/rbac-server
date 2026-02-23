import { Request, Response } from 'express';
import * as userService from './user.service';

export const createUser = async (req: Request, res: Response) => {
    const { name, email, password, orgId } = req.body;

    if (!email || !name || !password)
        return res.status(400).json({ error: 'Missing fields: name, email, password are required' });

    if (!orgId)
        return res.status(400).json({ error: 'orgId is required — user must be assigned to an organization' });

    try {
        const user = await userService.createUser(name, email, password, orgId);
        res.status(201).json(user);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const fetchAllUsers = async (req: Request, res: Response) => {
    try {
        // Org-scoped if x-org-id header is present, system-wide for system admins
        const orgId = req.headers['x-org-id'] as string | undefined;
        const users = await userService.listAllUsers(orgId);
        return res.status(200).json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const fetchMembersByRole = async (req: Request, res: Response) => {
    try {
        const orgId = req.headers['x-org-id'] as string;
        const projectId = req.headers['x-project-id'] as string | undefined;
        const { roleName } = req.params;

        if (!orgId) return res.status(400).json({ error: 'x-org-id header is required' });
        if (!roleName) return res.status(400).json({ error: 'roleName param is required' });

        const members = await userService.listMembersByRole(orgId, roleName, projectId);
        return res.status(200).json(members);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getResolvers = async (req: Request, res: Response) => {
    try {
        const orgId = req.headers['x-org-id'] as string;
        const projectId = req.headers['x-project-id'] as string | undefined;

        if (!orgId) return res.status(400).json({ error: 'x-org-id header is required' });

        const members = await userService.listMembersByRole(orgId, 'Resolver', projectId);
        return res.status(200).json(members);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateUserStatus = async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { status } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (typeof status !== 'boolean')
        return res.status(400).json({ error: 'status must be a boolean' });

    try {
        const user = await userService.setUserActiveStatus(userId, status);
        return res.status(200).json(user);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

export const getUserMemberships = async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const memberships = await userService.getUserMemberships(userId);
        return res.status(200).json(memberships);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

// Get org users not yet in a specific project
export const getOrgUsersForProject = async (req: Request, res: Response) => {
    try {
        const orgId = req.query.orgId as string;
        const projectId = req.query.projectId as string;

        if (!orgId || !projectId) return res.status(400).json({ error: 'orgId and projectId are required' });

        const users = await userService.getOrgUsersNotInProject(orgId, projectId);
        return res.status(200).json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// Get roles by scope (e.g., PROJECT, ORG)
export const getRolesByScope = async (req: Request, res: Response) => {
    try {
        const scope = (req.query.scope as string || 'PROJECT').toUpperCase();
        const roles = await userService.getRolesByScope(scope);
        return res.status(200).json(roles);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
