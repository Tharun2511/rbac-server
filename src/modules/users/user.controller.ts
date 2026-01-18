import { Request, Response } from 'express';
import * as userService from './user.service';
import { allowedRoles } from '../../constant/allowedRoles';

export const createUser = async (req: Request, res: Response) => {
    const { name, email, role, password } = req.body;

    if (!email || !name || !role || !password)
        return res.status(400).json({ message: 'Missing Fields' });

    try {
        const user = await userService.createUser(name, email, role, password);
        res.status(201).json(user);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const fetchAllUsers = async (_req: Request, res: Response) => {
    try {
        const users = await userService.listAllUsers();
        return res.status(200).json(users);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateUserStatus = async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { status } = req.body;

    if (!userId || !status) return res.status(400).json({ message: 'Invalid user or status' });

    if (typeof status !== 'boolean')
        return res.status(400).json({ message: 'Invalid isActive value' });

    try {
        const user = await userService.setUserActiveStatus(userId, status);
        return res.status(200).json(user);
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateUserRole = async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { role } = req.body;

    if (!userId || !role) return res.status(400).json({ message: 'Invalid user or role' });

    if (!allowedRoles.includes(role)) return res.status(400).json({ message: 'Invalid role' });

    try {
        const user = await userService.updateUserRole(userId, role);
        return res.status(200).json(user);
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};
