import { Router } from 'express';
import { requirePermission } from '../../middlewares/rbac.middleware';
import authMiddleware from '../../middlewares/auth.middleware';
import * as commentController from './comments.controller';

const router = Router();
router.use(authMiddleware);

// Create Comment - Requires 'ticket.comment' permission
router.post('/:ticketId', requirePermission('ticket.comment'), commentController.createComment);

// View Comments - Requires 'ticket.view' or 'ticket.comment' (usually if you can view ticket, you can view comments)
// Let's use 'ticket.view' as base permission.
router.get('/:ticketId', requirePermission('ticket.view'), commentController.getComments);

export default router;
