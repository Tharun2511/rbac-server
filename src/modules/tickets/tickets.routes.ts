import { Router } from 'express';
import { requirePermission, requireRole } from '../../middlewares/rbac.middleware';
import authMiddleware from '../../middlewares/auth.middleware';
import * as ticketController from './tickets.controller';

const router = Router();
router.use(authMiddleware);

// 1. My Tickets - Users viewing their own history. 
// Requires basic User role or just authenticated? Usually 'ticket.view' but scoped to self.
// Let's assume 'ticket.view' allows viewing tickets in general, but controller filters by user.
router.get('/me', requirePermission('ticket.view'), ticketController.getMyTickets);

// 2. List All Tickets - Admin/Manager feature.
// Use Role check as it's a broad management feature, or specific permission if available.
router.get('/', requireRole(['admin', 'manager']), ticketController.listAllTickets);

// 3. Create Ticket - Any user can create.
router.post('/', requirePermission('ticket.create'), ticketController.createTicket);

// 4. Assign Ticket - Manager only.
router.patch('/assign/:ticketId', requirePermission('ticket.assign'), ticketController.assignTicket);

// 5. Resolve Ticket - Resolver only.
router.patch('/resolve/:ticketId', requirePermission('ticket.resolve'), ticketController.resolveTicket);

// 6. Verify Resolution - User (creator) verifies.
router.patch('/verify/:ticketId', requirePermission('ticket.verify'), ticketController.verifyTicketResolved);

// 7. Close Ticket - Manager closes.
router.patch('/close/:ticketId', requirePermission('ticket.close'), ticketController.closeTicket);

// 8. Find by ID - General view permission.
router.get('/:ticketId', requirePermission('ticket.view'), ticketController.findTicketById);

// 9. My History (Duplicate of /me?)
router.get('/my/history', requirePermission('ticket.view'), ticketController.getMyTickets);

// 10. Assigned Tickets - Resolver viewing their work.
router.get('/assigned/:resolverId', requireRole(['resolver', 'manager', 'admin']), ticketController.getAssignedTickets);

// 11. Classification - Manager task.
// Schema didn't have specific 'ticket.classify' permission seeded, so fall back to Role or similar permission.
// Seeded permissions: create, view, assign, reassign, resolve, verify, close, comment.
// Let's use 'ticket.assign' or just requireRole('manager').
router.patch('/classification/:ticketId', requireRole(['manager', 'admin']), ticketController.updateTicketClassification);

// 12. Change Status - Manager task.
router.patch('/status/:ticketId', requireRole(['manager', 'admin']), ticketController.changeTicketStatus);

export default router;
