import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware';
import { rbacMiddleware, requirePermission } from '../../middlewares/rbac.middleware';
import * as ticketController from './tickets.controller';

const router = Router();
router.use(authMiddleware);
router.use(rbacMiddleware);

router.post('/', requirePermission('ticket.create'), ticketController.createTicket);
router.get('/me', requirePermission('ticket.view'), ticketController.getMyTickets);
router.get('/my/history', requirePermission('ticket.view'), ticketController.getMyTickets);
router.get('/assigned/:resolverId', requirePermission('ticket.view'), ticketController.getTickets);
router.get('/', requirePermission('ticket.view'), ticketController.getTickets);

// Granular ticket action routes (MUST be before generic /:id)
router.patch('/classification/:id', requirePermission('ticket.assign'), ticketController.updateTicketClassification);
router.patch('/assign/:id', requirePermission('ticket.assign'), ticketController.assignTicket);
router.patch('/resolve/:id', requirePermission('ticket.resolve'), ticketController.resolveTicket);
router.patch('/verify/:id', requirePermission('ticket.verify'), ticketController.verifyTicket);
router.patch('/close/:id', requirePermission('ticket.close'), ticketController.closeTicket);

// Generic update (catch-all for other modifications)
router.patch('/:id', requirePermission('ticket.update'), ticketController.updateTicket);

router.get('/:id', requirePermission('ticket.view'), ticketController.getTicket);

export default router;
