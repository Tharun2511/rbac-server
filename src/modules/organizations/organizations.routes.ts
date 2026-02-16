import { Router } from 'express';
import * as orgController from './organizations.controller';
import authMiddleware from '../../middlewares/auth.middleware';
import { rbacMiddleware, requirePermission } from '../../middlewares/rbac.middleware';

const router = Router();

// Apply Auth and RBAC middleware
router.use(authMiddleware);
router.use(rbacMiddleware);

// Create Org: Restricted to System Admin (as per decision)
// We need to check if user needs specific permission 'system.manage_tenants'
// Ideally system admin should have this permission.
// For now, we can check for 'system.manage_tenants'
router.post('/', requirePermission('system.manage_tenants'), orgController.createOrganization);

// List Orgs: Who can list all orgs? Maybe only System Admin can list ALL. 
// Users should see only their own. But repo.getAllOrganizations returns ALL.
// Limitation: getAllOrganizations is for System Admin.
router.get('/', requirePermission('system.manage_tenants'), orgController.getOrganizations);

// Org Specific Routes
// Note: x-org-id header must be passed for RBAC to work for Org Scoped permissions.
// But some of these might be global logic.

// Invite Member: Requires 'org.invite_member'
// Client must send x-org-id matching the URL param :id ideally, or we rely on the header.
// It's safer to rely on header for context.
router.post('/:id/members', requirePermission('org.invite_member'), orgController.inviteUser);

// List Members: Requires 'org.view_members' (or generic org.*)
// We didn't define org.view_members, let's use org.update or just allow any authenticated member?
// Let's assume 'org.manage_roles' or similar implies viewing.
// Or we can add 'org.view' to standard roles.
// For now, let's use 'org.update' as a proxy for admin-level access or similar.
router.get('/:id/members', requirePermission('org.update'), orgController.getMembers);

export default router;
