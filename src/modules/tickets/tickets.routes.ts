import { Router } from 'express';
import authorize from '../../middlewares/authorize.middleware';
import authMiddleware from '../../middlewares/auth.middleware';
import * as tickerController from './tickets.controller';

const router = Router();
router.use(authMiddleware);

router.post('/', authorize(['USER']), tickerController.createTicket);
router.patch('/assign/:ticketId', authorize(['MANAGER']), tickerController.assignTicket);
router.patch('/resolve/:ticketId', authorize(['RESOLVER']), tickerController.resolveTicket);
router.post('/verify/:ticketId', authorize(['USER']), tickerController.verifyTicketResolved);
router.post('/close/:ticketId', authorize(['MANAGER']), tickerController.closeTicket);

export default router;
