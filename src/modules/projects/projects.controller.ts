import { Request, Response } from 'express';
import * as projectService from './projects.service';

export const createProject = async (req: Request, res: Response) => {
    try {
        const { name, slug, orgId } = req.body;
        const project = await projectService.createProj(name, slug, orgId);
        res.status(201).json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create project' });
    }
};

export const getProjects = async (req: Request, res: Response) => {
    try {
        const queryOrgId = req.query.orgId as string;
        
        if (!queryOrgId) {
             return res.status(400).json({ message: 'orgId is required' });
        }

        const projects = await projectService.getOrgProjects(queryOrgId);
        res.json(projects);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch projects' });
    }
};

export const getMembers = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const members = await projectService.getProjMembers(id);
        res.json(members);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch members' });
    }
};

export const addMember = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { userId, roleId, orgId } = req.body;

        if (!userId) return res.status(400).json({ message: 'userId is required' });
        if (!roleId) return res.status(400).json({ message: 'roleId is required' });
        if (!orgId) return res.status(400).json({ message: 'orgId is required' });

        const member = await projectService.addMemberToProject(userId, orgId, id, roleId);
        res.status(201).json(member);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Failed to add member' });
    }
};

export const updateProject = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name } = req.body; // slug is read-only after creation
        const project = await projectService.updateProj(id, name);
        if (!project) return res.status(404).json({ message: 'Project not found' });
        res.json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update project' });
    }
};

export const deleteProject = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await projectService.deleteProj(id);
        if (!result) return res.status(404).json({ message: 'Project not found' });
        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete project' });
    }
};

export const removeMember = async (req: Request, res: Response) => {
    try {
        const { id, userId } = req.params;
        const result = await projectService.removeMember(id, userId);
        if (!result) return res.status(404).json({ message: 'Member not found in project' });
        res.json({ message: 'Member removed successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to remove member' });
    }
};
