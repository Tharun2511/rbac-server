import { Router } from 'express';
import { getManagerAnalytics, getUserAnalytics, getAdminAnalytics, getResolverAnalytics } from './analytics.controller';
import authMiddleware from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';

const router = Router();
router.use(authMiddleware);

// User Analytics - Requires specific view permission for user metrics.
router.get('/user', requirePermission('analytics.view.user'), getUserAnalytics);

// Manager Analytics - Requires manager view permission.
router.get('/manager', requirePermission('analytics.view.manager'), getManagerAnalytics);

// Admin Analytics - Top level admin view.
router.get('/admin', requirePermission('analytics.view.admin'), getAdminAnalytics);

// Resolver Analytics - Resolver performance view.
router.get('/resolver', requirePermission('analytics.view.resolver'), getResolverAnalytics);

export default router;
