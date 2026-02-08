import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import * as userController from './user.controller';

const router = Router();
router.use(authMiddleware);

// Fetch All Users - Admin only
router.get('/', requireRole('admin'), userController.fetchAllUsers);

// Fetch Resolvers - Admin or Manager
// (Managers need to assign tickets to resolvers)
router.get(
    '/resolvers',
    requireRole(['admin', 'manager']),
    userController.fetchAllResolvers,
);

// Create User - Admin only
router.post('/', requireRole('admin'), userController.createUser);

// Update Status (Activate/Deactivate) - Admin only
router.patch('/status/:userId', requireRole('admin'), userController.updateUserStatus);

// Update Role - Admin only
router.patch('/role/:userId', requireRole('admin'), userController.updateUserRole);

export default router;
