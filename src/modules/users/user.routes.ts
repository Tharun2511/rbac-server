import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware';
import authorizeMiddleware from '../../middlewares/authorize.middleware';
import * as userController from './user.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', authorizeMiddleware(['ADMIN']), userController.fetchAllUsers);
router.get(
    '/resolvers',
    authorizeMiddleware(['ADMIN', 'MANAGER']),
    userController.fetchAllResolvers,
);
router.post('/', authorizeMiddleware(['ADMIN']), userController.createUser);
router.patch('/status/:userId', authorizeMiddleware(['ADMIN']), userController.updateUserStatus);
router.patch('/role/:userId', authorizeMiddleware(['ADMIN']), userController.updateUserRole);

export default router;
