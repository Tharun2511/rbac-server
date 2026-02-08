
import { rbacRepository } from './rbac.repository';
import { Role, Permission, UserRole, RolePermission } from './rbac.types';
import logger from '../../utils/logger';

export class RbacRegistry {
  private static instance: RbacRegistry;
  
  // Cache Structures
  private roles: Map<string, Role> = new Map();
  private permissions: Map<string, Permission> = new Map();
  private rolePermissions: Map<string, Set<string>> = new Map(); // roleId -> Set<permissionName>
  private userRoles: Map<string, Map<string, Set<string>>> = new Map(); // userId -> Map<projectId | 'global', Set<roleId>>

  private constructor() {}

  public static getInstance(): RbacRegistry {
    if (!RbacRegistry.instance) {
      RbacRegistry.instance = new RbacRegistry();
    }
    return RbacRegistry.instance;
  }

  public async init() {
    logger.info('🔄 Loading RBAC Registry...');
    await this.reload();
    logger.info('✅ RBAC Registry Loaded');
  }

  public async reload() {
    const roles = await rbacRepository.getRoles();
    const permissions = await rbacRepository.getPermissions();
    const rolePermissions = await rbacRepository.getRolePermissions();
    const userRoles = await rbacRepository.getUserRoles();

    // Clear existing cache
    this.roles.clear();
    this.permissions.clear();
    this.rolePermissions.clear();
    this.userRoles.clear();

    // 1. Cache Roles & Permissions
    roles.forEach(r => this.roles.set(r.id, r));
    permissions.forEach(p => this.permissions.set(p.id, p));

    // 2. Cache Role Permissions (Map RoleID -> Set<PermissionName>)
    rolePermissions.forEach(rp => {
      const perm = this.permissions.get(rp.permission_id);
      if (perm) {
        if (!this.rolePermissions.has(rp.role_id)) {
          this.rolePermissions.set(rp.role_id, new Set());
        }
        this.rolePermissions.get(rp.role_id)!.add(perm.name);
      }
    });

    // 3. Cache User Roles (Map UserId -> ProjectId -> Set<RoleId>)
    userRoles.forEach(ur => {
      if (!this.userRoles.has(ur.user_id)) {
        this.userRoles.set(ur.user_id, new Map());
      }
      
      const projectKey = ur.project_id || 'global';
      const projectRoles = this.userRoles.get(ur.user_id)!;

      if (!projectRoles.has(projectKey)) {
        projectRoles.set(projectKey, new Set());
      }
      projectRoles.get(projectKey)!.add(ur.role_id);
    });
  }

  public userHasPermission(userId: string, projectId: string, permissionName: string): boolean {
    const userProjectRoles = this.userRoles.get(userId);
    if (!userProjectRoles) return false;

    // Check specific project roles AND global roles
    const rolesToCheck = new Set<string>();
    
    // Add roles for the specific project
    if (projectId && userProjectRoles.has(projectId)) {
      userProjectRoles.get(projectId)!.forEach(r => rolesToCheck.add(r));
    }

    // Add global roles
    if (userProjectRoles.has('global')) {
      userProjectRoles.get('global')!.forEach(r => rolesToCheck.add(r));
    }

    // Iterate roles and check permissions
    for (const roleId of rolesToCheck) {
      const permissions = this.rolePermissions.get(roleId);
      if (permissions && permissions.has(permissionName)) {
        return true;
      }
      
      // Handle Admin generic catch-all if seeded as 'ALL' or handled by logic
      // But typically 'admin' role has all permission entries in DB. 
      // If we want implicit admin superuser:
      const role = this.roles.get(roleId);
      if (role && role.name === 'admin') return true; 
    }

    return false;
  }

  // Helper to check if user has a specific role (e.g. 'manager')
  public userHasRole(userId: string, projectId: string, roleName: string): boolean {
    const userProjectRoles = this.userRoles.get(userId);
    if (!userProjectRoles) return false;

    const rolesToCheck = new Set<string>();
    if (projectId && userProjectRoles.has(projectId)) {
        userProjectRoles.get(projectId)!.forEach(r => rolesToCheck.add(r));
    }
    if (userProjectRoles.has('global')) {
        userProjectRoles.get('global')!.forEach(r => rolesToCheck.add(r));
    }

    for (const roleId of rolesToCheck) {
        const role = this.roles.get(roleId);
        if (role && role.name === roleName) return true;
    }
    return false;
  }
}

export const rbacRegistry = RbacRegistry.getInstance();
