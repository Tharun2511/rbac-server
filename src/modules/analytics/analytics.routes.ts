import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware';
import { rbacMiddleware, requirePermission } from '../../middlewares/rbac.middleware';
import * as analyticsController from './analytics.controller';

const router = Router();

router.use(authMiddleware);
router.use(rbacMiddleware);

// Org-wide analytics: Requires 'analytics.view.org'
router.get('/org', requirePermission('analytics.view.org'), analyticsController.getOrgAnalytics);

// Personal analytics: Requires 'analytics.view.self' (essentially everyone)
// Should we require 'analytics.view.self' or just allow authenticated?
// Let's assume there is a permission for it, or we add it to default roles.
// For now, let's use 'analytics.view.self'
router.get('/me', requirePermission('analytics.view.self'), analyticsController.getMyAnalytics);

export default router;
