import { Response, NextFunction, Request } from 'express';
import { db } from '../config/db';
import { permissionCache } from '../rbac/permission-cache';

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

        const userRes = await db.query('SELECT "isSystemAdmin" FROM users WHERE id = $1', [userId]);
        const isSystemAdmin = userRes.rows[0]?.isSystemAdmin;

        if (isSystemAdmin) {
            // Set flag for downstream controllers
            (req as any).isSystemAdmin = true;

            const sysRoleRes = await db.query("SELECT id FROM roles WHERE scope = 'SYSTEM' LIMIT 1");
            const sysRoleId = sysRoleRes.rows[0]?.id;
            
            if (sysRoleId) {
                req.permissions = permissionCache.getPermissions([sysRoleId]);
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
            // Check project-level membership
            const memberRes = await db.query(
                `SELECT "roleId" FROM members WHERE "userId" = $1 AND "projectId" = $2`,
                [userId, projectId]
            );
            if (memberRes.rows[0]?.roleId) {
                roleIds.push(memberRes.rows[0].roleId);
            }
            req.context = { projectId, orgId };
        }

        if (orgId) {
            // Also check org-level membership (grants org-scoped permissions)
            const memberRes = await db.query(
                `SELECT "roleId" FROM members WHERE "userId" = $1 AND "orgId" = $2 AND "projectId" IS NULL`,
                [userId, orgId]
            );
            if (memberRes.rows[0]?.roleId) {
                roleIds.push(memberRes.rows[0].roleId);
            }
            if (!req.context) req.context = { orgId };
        }

        // 4. Load Permissions (merge from all applicable roles)
        if (roleIds.length > 0) {
            req.permissions = permissionCache.getPermissions(roleIds);
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
        if (!req.permissions || !req.permissions.has(permission)) {
            return res.status(403).json({ message: `Forbidden: Missing permission ${permission}` });
        }
        next();
    };
};
