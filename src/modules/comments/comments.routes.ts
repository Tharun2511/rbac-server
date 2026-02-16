import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware';
import { rbacMiddleware, requirePermission } from '../../middlewares/rbac.middleware';
import * as commentController from './comments.controller';

const router = Router();

router.use(authMiddleware);
router.use(rbacMiddleware);

router.post('/:id', requirePermission('ticket.comment'), commentController.createComment);
router.get('/:id', requirePermission('ticket.view'), commentController.getComments);

export default router;
