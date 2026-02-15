import { Router } from 'express';
import * as projectController from './projects.controller';
import authMiddleware from '../../middlewares/auth.middleware';
import { rbacMiddleware, requirePermission } from '../../middlewares/rbac.middleware';

const router = Router();

router.use(authMiddleware);
router.use(rbacMiddleware);

// Create Project: Requires 'project.create' (scoped to Org)
// Client must send x-org-id header.
router.post('/', requirePermission('project.create'), projectController.createProject);

// List Projects: Requires 'project.view' (scoped to Org)
// Client must send x-org-id.
router.get('/', requirePermission('project.view'), projectController.getProjects);

// Check members
router.get('/:id/members', requirePermission('project.update'), projectController.getMembers);

// Add member to project (by userId, not email invite)
router.post('/:id/members', requirePermission('project.manage_members'), projectController.addMember);
// Update Project
router.put('/:id', requirePermission('project.update'), projectController.updateProject);

// Delete Project
router.delete('/:id', requirePermission('project.delete'), projectController.deleteProject);

// Remove Member
router.delete('/:id/members/:userId', requirePermission('project.manage_members'), projectController.removeMember);

export default router;
