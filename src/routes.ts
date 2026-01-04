import { Request, Response, Router } from 'express';
import authRoutes from './modules/auth/auth.routes';

const router = Router();

router.use('/main', (_req: Request, res: Response) => {
  return res.status(200).json({ message: 'Hello World' });
});

router.use('/auth', authRoutes);

export default router;
