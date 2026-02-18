import { signToken } from '../../utils/jwt';
import { passwordCompare } from '../../utils/password';
import { findUserByEmail, findUserById } from '../users/user.repository';
import crypto from "crypto";
import * as authRepository from './auth.repository';
import { db } from '../../config/db';

export const login = async (email: string, password: string) => {
    const user = await findUserByEmail(email);

    if (!user || (!user.isActive && !user.isSystemAdmin)) throw new Error('Invalid Credentials');

    const passwordMatch = await passwordCompare(password, user.passwordHash);

    if (!passwordMatch) throw new Error('Invalid Credentials');

    // Generate Tokens
    const token = signToken({ userId: user.id }); // Payload strictly userId
    const refreshToken = generateRefreshToken();
    
    // Store Refresh Token (Expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await authRepository.storeRefreshToken(user.id, refreshToken, expiresAt);

    // Fetch Available Contexts (Orgs & Projects)
    const contexts = await getMyContexts(user.id);

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            isSystemAdmin: user.isSystemAdmin,
        },
        token,
        refreshToken,
        contexts
    };
};

export function hashRefreshToken(refreshToken: string) {
    return crypto.createHash("sha256").update(refreshToken).digest("hex");
}

export function generateRefreshToken() {
    return crypto.randomBytes(40).toString("hex");
}

export async function getUserByRefreshToken (refreshToken: string) {
    return await authRepository.findUserByRefreshToken(refreshToken);
}

// Helper: Get all Orgs and Projects user has access to
export async function getMyContexts(userId: string) {
    // 1. Get Memberships
    const result = await db.query(`
        SELECT 
            m."orgId", 
            o.name as "orgName", 
            o.slug as "orgSlug",
            m."projectId", 
            p.name as "projectName", 
            p.slug as "projectSlug",
            r.name as "roleName",
            r.scope as "roleScope"
        FROM members m
        JOIN roles r ON m."roleId" = r.id
        LEFT JOIN organizations o ON m."orgId" = o.id
        LEFT JOIN projects p ON m."projectId" = p.id
        WHERE m."userId" = $1
    `, [userId]);

    // Group by Org
    const orgMap = new Map();
    const orgScopedOrgIds: string[] = []; // Track orgs where user has ORG-scoped role

    for (const row of result.rows) {
        if (!row.orgId) continue;

        if (!orgMap.has(row.orgId)) {
            orgMap.set(row.orgId, {
                id: row.orgId,
                name: row.orgName,
                slug: row.orgSlug,
                projects: []
            });
        }

        // Track if user has an ORG-scoped role (e.g., Org Owner, Org Admin)
        if (row.roleScope === 'ORG' && !orgScopedOrgIds.includes(row.orgId)) {
            orgScopedOrgIds.push(row.orgId);
        }

        if (row.projectId) {
            orgMap.get(row.orgId).projects.push({
                id: row.projectId,
                name: row.projectName,
                slug: row.projectSlug,
                role: row.roleName
            });
        }
    }

    // 2. For ORG-scoped roles, also load all projects in those orgs
    //    (org owners/admins can access all projects even without direct membership)
    if (orgScopedOrgIds.length > 0) {
        const placeholders = orgScopedOrgIds.map((_, i) => `$${i + 1}`).join(', ');
        const projResult = await db.query(`
            SELECT id, name, slug, "orgId"
            FROM projects
            WHERE "orgId" IN (${placeholders})
        `, orgScopedOrgIds);

        for (const proj of projResult.rows) {
            const org = orgMap.get(proj.orgId);
            if (org) {
                // Avoid duplicates (user might already have a direct project membership)
                const exists = org.projects.some((p: any) => p.id === proj.id);
                if (!exists) {
                    org.projects.push({
                        id: proj.id,
                        name: proj.name,
                        slug: proj.slug,
                        role: 'Via Org Role'
                    });
                }
            }
        }
    }

    const organizations = Array.from(orgMap.values()).map(({ projects, ...org }) => org);
    const projects = Array.from(orgMap.values()).flatMap(o => o.projects.map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        orgId: o.id
    })));

    return { organizations, projects };
}

// Get user permissions for the current context (derived via headers)
export async function getMyPermissions(userId: string, orgId?: string, projectId?: string): Promise<string[]> {
    const { permissionCache } = require('../../rbac/permission-cache');

    // Check if system admin
    const userRes = await db.query('SELECT "isSystemAdmin" FROM users WHERE id = $1', [userId]);
    if (userRes.rows[0]?.isSystemAdmin) {
        const sysRoleRes = await db.query("SELECT id FROM roles WHERE scope = 'SYSTEM' LIMIT 1");
        const sysRoleId = sysRoleRes.rows[0]?.id;
        if (sysRoleId) {
            const perms = await permissionCache.getPermissions([sysRoleId]);
            return Array.from(perms as Set<string>);
        }
    }

    const roleIds: string[] = [];

    if (projectId) {
        const memberRes = await db.query(
            `SELECT "roleId" FROM members WHERE "userId" = $1 AND "projectId" = $2`,
            [userId, projectId]
        );
        if (memberRes.rows[0]?.roleId) roleIds.push(memberRes.rows[0].roleId);
    }

    if (orgId) {
        const memberRes = await db.query(
            `SELECT "roleId" FROM members WHERE "userId" = $1 AND "orgId" = $2 AND "projectId" IS NULL`,
            [userId, orgId]
        );
        if (memberRes.rows[0]?.roleId) roleIds.push(memberRes.rows[0].roleId);
    }

    if (roleIds.length === 0) return [];

    const perms = await permissionCache.getPermissions(roleIds);
    return Array.from(perms as Set<string>);
}
