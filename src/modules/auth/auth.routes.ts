import { Router } from 'express';
import * as authController from './auth.controller';
import authMiddleware from '../../middlewares/auth.middleware';

const router = Router();

router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authMiddleware, authController.logout);

// Authenticated endpoints for RBAC context
router.get('/me/contexts', authMiddleware, authController.getContexts);
router.get('/me/permissions', authMiddleware, authController.getPermissions);

export default router;
