
import { Request, Response, NextFunction } from 'express';
import { rbacRegistry } from '../modules/rbac/rbac.registry';

/**
 * Helper to extract projectId from various locations in the request.
 * Priority: Route Param > Header > Body > Query
 */
const getProjectId = (req: Request): string | undefined => {
  // 1. Route Params (e.g., /projects/:projectId/...)
  if (req.params.projectId) return req.params.projectId;

  // 2. Custom Header
  const headerProjectId = req.headers['x-project-id'];
  if (typeof headerProjectId === 'string') return headerProjectId;

  // 3. Body (for POST/PUT)
  if (req.body && req.body.projectId) return req.body.projectId;

  // 4. Query String
  if (req.query.projectId && typeof req.query.projectId === 'string') return req.query.projectId;

  return undefined;
};

export const requirePermission = (permission: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      // Fix: use user.userId as defined in AuthUser type and auth.middleware.ts
      if (!user || !user.userId) {
         res.status(401).json({ error: 'Unauthorized: No user found' });
         return;
      }

      const projectId = getProjectId(req);
      const permissionsToCheck = Array.isArray(permission) ? permission : [permission];
      
      // OR Logic: User needs at least one of the permissions
      let hasAccess = false;
      for (const p of permissionsToCheck) {
        if (rbacRegistry.userHasPermission(user.userId, projectId || '', p)) {
            hasAccess = true;
            break;
        }
      }

      if (!hasAccess) {
         res.status(403).json({ 
          error: 'Forbidden', 
          message: `You lack the required permission: ${permissionsToCheck.join(' OR ')}` 
        });
        return;
      }

      next();
    } catch (error) {
      console.error('RBAC Middleware Error:', error);
      res.status(500).json({ error: 'Internal Server Error during authorization' });
    }
  };
};

export const requireRole = (roleName: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      // Fix: use user.userId
      if (!user || !user.userId) {
         res.status(401).json({ error: 'Unauthorized: No user found' });
         return;
      }

      const projectId = getProjectId(req);
      const rolesToCheck = Array.isArray(roleName) ? roleName : [roleName];

      // OR Logic: User needs at least one of the roles
      let authorized = false;
      for (const r of rolesToCheck) {
          if (rbacRegistry.userHasRole(user.userId, projectId || '', r)) {
              authorized = true;
              break;
          }
      }

      if (!authorized) {
         res.status(403).json({ 
          error: 'Forbidden', 
          message: `You lack the required role: ${rolesToCheck.join(' OR ')}` 
        });
        return;
      }

      next();
    } catch (error) {
      console.error('RBAC Middleware Error:', error);
      res.status(500).json({ error: 'Internal Server Error during authorization' });
    }
  };
};
