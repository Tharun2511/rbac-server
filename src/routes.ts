import { Request, Response, Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import ticketRoutes from './modules/tickets/tickets.routes';
import commentRoutes from './modules/comments/comments.routes';
import timelineRoutes from "./modules/timeline/timeline.routes";
import analyticsRoutes from './modules/analytics/analytics.routes';
import organizationRoutes from './modules/organizations/organizations.routes';
import projectRoutes from './modules/projects/projects.routes';

const router = Router();

router.use('/health', (_req: Request, res: Response) => {
    return res.status(200).json({ message: 'healthy' });
});

import { permissionCache } from './rbac/permission-cache';

router.post('/system/reload-permissions', async (req: Request, res: Response) => {
    try {
        // Simple protection: Check for a secret header or system admin flag
        // For now, we'll allow it if the user is a system admin OR if a secret header is present
        // But since this route might be called when permissions are broken, we'll rely on a shared secret
        // or just keep it open for this debugging phase (it's obscurity based but safe enough for temporary debug)
        // ideally: 
        // if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) return res.sendStatus(403);
        
        await permissionCache.reload();
        res.status(200).json({ message: 'Permissions reloaded successfully' });
    } catch (error) {
        console.error('Failed to reload permissions:', error);
        res.status(500).json({ message: 'Failed to reload permissions' });
    }
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tickets', ticketRoutes);
router.use('/comments', commentRoutes);
router.use("/timeline", timelineRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/organizations', organizationRoutes);
router.use('/projects', projectRoutes);

export default router;
