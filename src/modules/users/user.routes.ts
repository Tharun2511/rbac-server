import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware';
import { rbacMiddleware, requirePermission } from '../../middlewares/rbac.middleware';
import * as userController from './user.controller';

const router = Router();

router.use(authMiddleware);
router.use(rbacMiddleware);

// List all users (system admins see all, org members see org-scoped)
router.get('/', requirePermission('system.manage_users'), userController.fetchAllUsers);

// List members by role within org context
router.get('/role/:roleName', requirePermission('org.invite_member'), userController.fetchMembersByRole);

// Get roles by scope (e.g., ?scope=PROJECT)
router.get('/roles', requirePermission('project.manage_members'), userController.getRolesByScope);

// Get org users not yet in a specific project (?orgId=...&projectId=...)
router.get('/available-for-project', requirePermission('project.manage_members'), userController.getOrgUsersForProject);

// Create a new user (system admin only, requires orgId)
router.post('/', requirePermission('system.manage_users'), userController.createUser);

// Toggle user active status
router.patch('/status/:userId', requirePermission('system.manage_users'), userController.updateUserStatus);

// Get a user's memberships (orgs, projects, roles)
router.get('/:userId/memberships', requirePermission('system.manage_users'), userController.getUserMemberships);

export default router;
