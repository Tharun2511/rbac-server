import { Router } from 'express';
import authorize from '../../middlewares/authorize.middleware';
import authMiddleware from '../../middlewares/auth.middleware';
import * as ticketController from './tickets.controller';

const router = Router();
router.use(authMiddleware);

router.get('/me', authorize(['USER']), ticketController.getMyTickets);
router.get('/', authorize(['ADMIN', 'MANAGER']), ticketController.listAllTickets);
router.post('/', authorize(['USER']), ticketController.createTicket);
router.patch('/assign/:ticketId', authorize(['MANAGER']), ticketController.assignTicket);
router.patch('/resolve/:ticketId', authorize(['RESOLVER']), ticketController.resolveTicket);
router.patch('/verify/:ticketId', authorize(['USER']), ticketController.verifyTicketResolved);
router.patch('/close/:ticketId', authorize(['MANAGER']), ticketController.closeTicket);
router.get('/:ticketId', ticketController.findTicketById);
router.get('/my/history', ticketController.getMyTickets);
router.get('/assigned/:resolverId', authorize(['RESOLVER']), ticketController.getAssignedTickets);

export default router;
