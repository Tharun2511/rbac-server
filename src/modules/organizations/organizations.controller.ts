import { Request, Response } from 'express';
import * as orgService from './organizations.service';

export const createOrganization = async (req: Request, res: Response) => {
    try {
        const { name, slug } = req.body;
        // Permission check is done in middleware
        const org = await orgService.createOrg(name, slug);
        res.status(201).json(org);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create organization' });
    }
};

export const getOrganizations = async (req: Request, res: Response) => {
    try {
        const orgs = await orgService.getOrgs();
        res.json(orgs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch organizations' });
    }
};

export const getMembers = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const members = await orgService.getOrgMembers(id);
        res.json(members);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch members' });
    }
};

export const inviteUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { email, roleId } = req.body;
        const member = await orgService.inviteMember(id, email, roleId);
        res.status(201).json(member);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Failed to invite member' });
    }
};
