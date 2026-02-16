import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware';
import { rbacMiddleware, requirePermission } from '../../middlewares/rbac.middleware';
import * as analyticsController from './analytics.controller';

const router = Router();

router.use(authMiddleware);
router.use(rbacMiddleware);

// System admin analytics: Requires 'system.manage_tenants' (system admin only)
router.get('/system', requirePermission('system.manage_tenants'), analyticsController.getSystemAdminAnalytics);

// Org-wide analytics: Requires 'analytics.view.org'
router.get('/org', requirePermission('analytics.view.org'), analyticsController.getOrgAnalytics);

// Personal analytics: Requires 'analytics.view.self' (essentially everyone)
// Should we require 'analytics.view.self' or just allow authenticated?
// Let's assume there is a permission for it, or we add it to default roles.
// For now, let's use 'analytics.view.self'
router.get('/me', requirePermission('analytics.view.self'), analyticsController.getMyAnalytics);

// Role-specific analytics endpoints
router.get('/project-manager', requirePermission('analytics.view.project'), analyticsController.getProjectManagerAnalytics);
router.get('/agent', requirePermission('analytics.view.self'), analyticsController.getAgentAnalytics);
router.get('/requester', requirePermission('analytics.view.self'), analyticsController.getRequesterAnalytics);
router.get('/org-owner', requirePermission('analytics.view.org'), analyticsController.getOrgOwnerAnalytics);

export default router;
