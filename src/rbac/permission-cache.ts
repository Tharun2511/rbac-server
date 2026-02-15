import { db } from '../config/db';

class PermissionCache {
    private rolePermissions: Map<string, Set<string>> = new Map();
    private isLoaded = false;

    /**
     * Loads all role permissions from the database into memory.
     * Should be called on server startup.
     */
    async load() {
        console.log('🔄 Loading Permission Cache...');
        try {
            const result = await db.query(`
                SELECT 
                    rp."roleId",
                    p.slug
                FROM role_permissions rp
                JOIN permissions p ON rp."permissionId" = p.id
            `);

            this.rolePermissions.clear();

            for (const row of result.rows) {
                const roleId = row.roleId;
                const permissionSlug = row.slug;

                if (!this.rolePermissions.has(roleId)) {
                    this.rolePermissions.set(roleId, new Set());
                }
                this.rolePermissions.get(roleId)?.add(permissionSlug);
            }

            this.isLoaded = true;
            console.log(`✅ Permission Cache Loaded. Roles cached: ${this.rolePermissions.size}`);
        } catch (error) {
            console.error('❌ Failed to load permission cache:', error);
            throw error;
        }
    }

    /**
     * Returns a combined set of permissions for a list of role IDs.
     */
    getPermissions(roleIds: string[]): Set<string> {
        if (!this.isLoaded) {
            console.warn('⚠️ PermissionCache not loaded yet! Returning empty set.');
            return new Set();
        }

        const permissions = new Set<string>();
        for (const roleId of roleIds) {
            const rolePerms = this.rolePermissions.get(roleId);
            if (rolePerms) {
                for (const perm of rolePerms) {
                    permissions.add(perm);
                }
            }
        }
        return permissions;
    }

    /**
     * Checks if a user (via their roles) has a specific permission.
     */
    hasPermission(roleIds: string[], permissionSlug: string): boolean {
        const perms = this.getPermissions(roleIds);
        return perms.has(permissionSlug);
    }
}

export const permissionCache = new PermissionCache();
