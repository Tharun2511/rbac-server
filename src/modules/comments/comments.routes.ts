import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware';
import * as commentController from './comments.controller';

const router = Router();

router.use(authMiddleware);

router.post('/:ticketId', commentController.createComment);
router.get('/:ticketId', commentController.getComments);

export default router;
