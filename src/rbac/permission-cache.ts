import { db } from '../config/db';

class PermissionCache {
    private rolePermissions: Map<string, Set<string>> = new Map();
    private isLoaded = false;
    private loadPromise: Promise<void> | null = null;

    /**
     * Ensures the cache is loaded before any permission check.
     * Safe to call concurrently — deduplicates parallel loads.
     */
    async ensureLoaded() {
        if (this.isLoaded) return;
        if (!this.loadPromise) {
            this.loadPromise = this._doLoad();
        }
        await this.loadPromise;
    }

    private async _doLoad() {
        console.log('Loading Permission Cache...');
        const startTime = Date.now();
        try {
            const result = await db.query(`
                SELECT
                    rp."roleId",
                    p.slug
                FROM role_permissions rp
                JOIN permissions p ON rp."permissionId" = p.id
            `);

            console.log(`Fetched ${result.rows.length} permission entries from DB`);

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
            const duration = Date.now() - startTime;
            console.log(`Permission Cache Loaded in ${duration}ms. Roles cached: ${this.rolePermissions.size}`);
        } catch (error) {
            this.loadPromise = null; // Allow retry on failure
            console.error('Failed to load permission cache:', error);
            throw error;
        }
    }

    /**
     * Force reload (e.g. after role/permission changes).
     */
    async reload() {
        this.isLoaded = false;
        this.loadPromise = null;
        return this.ensureLoaded();
    }

    /**
     * Returns a combined set of permissions for a list of role IDs.
     * Lazy-loads the cache on first call.
     */
    async getPermissions(roleIds: string[]): Promise<Set<string>> {
        await this.ensureLoaded();

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
    async hasPermission(roleIds: string[], permissionSlug: string): Promise<boolean> {
        const perms = await this.getPermissions(roleIds);
        return perms.has(permissionSlug);
    }
}

export const permissionCache = new PermissionCache();
