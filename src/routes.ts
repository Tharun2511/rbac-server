import { Request, Response, Router } from 'express';

const router = Router();

router.use('/main', (_req: Request, res: Response) => {
  return res.status(200).json({ message: 'Hello World' });
});

export default router;
