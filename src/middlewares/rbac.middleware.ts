import { Response, NextFunction, Request } from 'express';
import { permissionCache } from '../rbac/permission-cache';
import { userContextCache } from '../rbac/user-context-cache';

export const rbacMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
             // Should verify authMiddleware runs before this
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // 1. Check if System Admin (Global Access)
        // We need to fetch the user's isSystemAdmin flag if not in token
        // Optimization: For now, query user details or assume token has it if we add it back.
        // For security, verifying against DB is better.
        // Let's do a quick DB lookup for the user to get system status and roles.
        // Actually, for performance, we might want to cache this or put isSystemAdmin in token?
        // Plan said: "Scope resolution happens via DB/Cache lookup on every request" -> Good.

        const isSystemAdmin = await userContextCache.getIsSystemAdmin(userId);

        if (isSystemAdmin) {
            // Set flag for downstream controllers
            (req as any).isSystemAdmin = true;

            const sysRoleId = await userContextCache.getSystemRoleId();
            
            if (sysRoleId) {
                req.permissions = await permissionCache.getPermissions([sysRoleId]);
                next();
                return;
            }
        }

        // 2. Extract Context Headers
        const orgId = req.headers['x-org-id'] as string;
        const projectId = req.headers['x-project-id'] as string;

        // 3. Resolve Roles in Context
        const roleIds: string[] = [];

        if (projectId) {
            // Check project-level membership (cached in Redis)
            const projectRoleId = await userContextCache.getProjectRoleId(userId, projectId);
            if (projectRoleId) {
                roleIds.push(projectRoleId);
            }
            req.context = { projectId, orgId };
        }

        if (orgId) {
            // Also check org-level membership (cached in Redis)
            const orgRoleId = await userContextCache.getOrgRoleId(userId, orgId);
            if (orgRoleId) {
                roleIds.push(orgRoleId);
            }
            if (!req.context) req.context = { orgId };
        }

        // 4. Load Permissions (merge from all applicable roles)
        if (roleIds.length > 0) {
            req.permissions = await permissionCache.getPermissions(roleIds);
            if (req.context) req.context.roleId = roleIds[0]; // Primary role
        } else {
            req.permissions = new Set();
        }

        next();
    } catch (error) {
        console.error('RBAC Middleware Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const requirePermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.permissions) {
            return res.status(403).json({ message: `Forbidden: Missing permission ${permission}` });
        }
        // Direct match
        if (req.permissions.has(permission)) return next();
        // Wildcard match: "ticket.*" covers "ticket.assign"
        const parts = permission.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const wildcard = parts.slice(0, i).join('.') + '.*';
            if (req.permissions.has(wildcard)) return next();
        }
        // Global wildcard
        if (req.permissions.has('*')) return next();
        return res.status(403).json({ message: `Forbidden: Missing permission ${permission}` });
    };
};
