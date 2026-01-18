import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware';
import authorizeMiddleware from '../../middlewares/authorize.middleware';
import * as userController from './user.controller';

const router = Router();

router.use(authMiddleware);
router.use(authorizeMiddleware(['ADMIN']));

router.get('/', userController.fetchAllUsers);
router.post('/', userController.createUser);
router.patch('/status/:userId', userController.updateUserStatus);
router.patch('/role/:userId', userController.updateUserRole);

export default router;
