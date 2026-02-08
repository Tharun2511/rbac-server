
import { Router } from 'express';
import { rbacRegistry } from './rbac.registry';
// Assuming we want strict security for reloading, usually require generic Admin role or token
// Here we use requireRole if we trust the registry, or basic auth.
import { requireRole } from '../../middlewares/rbac.middleware';

const router = Router();

// Endpoint to refresh RBAC cache manually (e.g., after DB updates)
router.post('/refresh', requireRole('admin'), async (req, res) => {
  try {
    await rbacRegistry.reload();
    res.status(200).json({ message: '✅ RBAC Registry reloaded successfully' });
  } catch (error) {
    console.error('Failed to reload RBAC:', error);
    res.status(500).json({ error: 'Failed to reload RBAC registry' });
  }
});

// Debug endpoint to see permissions for current user
router.get('/my-permissions', async (req, res) => {
  try {
      // Return what permissions the user has for a given project (or all?)
      // Without project ID, maybe list global roles
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      // This is a minimal debug point.
      // Logic could be expanded to return full permission set for UI usage.
      res.json({ message: 'Endpoint unimplemented for full dump, check logs or registry directly.' });
  } catch(e) {
      res.status(500).json({ error: 'Internal Error' });
  }
});

export default router;
