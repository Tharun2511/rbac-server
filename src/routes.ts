import { Request, Response, Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import ticketRoutes from './modules/tickets/tickets.routes';

const router = Router();

router.use('/health', (_req: Request, res: Response) => {
    return res.status(200).json({ message: 'healthy' });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tickets', ticketRoutes);

export default router;
