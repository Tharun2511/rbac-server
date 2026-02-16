import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware';
import { rbacMiddleware, requirePermission } from '../../middlewares/rbac.middleware';
import * as ticketController from './tickets.controller';

const router = Router();
router.use(authMiddleware);
router.use(rbacMiddleware);

router.post('/', requirePermission('ticket.create'), ticketController.createTicket);
router.get('/me', requirePermission('ticket.view'), ticketController.getMyTickets);
router.get('/', requirePermission('ticket.view'), ticketController.getTickets);
router.get('/:id', requirePermission('ticket.view'), ticketController.getTicket);
router.patch('/:id', requirePermission('ticket.update'), ticketController.updateTicket);

export default router;
