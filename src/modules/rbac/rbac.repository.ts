
import { db } from '../../config/db';
import { Role, Permission, UserRole, RolePermission } from './rbac.types';

export class RbacRepository {
  async getRoles(): Promise<Role[]> {
    const res = await db.query<Role>('SELECT id, name FROM roles');
    return res.rows;
  }

  async getPermissions(): Promise<Permission[]> {
    const res = await db.query<Permission>('SELECT id, name, resource FROM permissions');
    return res.rows;
  }

  async getRolePermissions(): Promise<RolePermission[]> {
    const res = await db.query<RolePermission>('SELECT role_id, permission_id FROM role_permissions');
    return res.rows;
  }

  async getUserRoles(): Promise<UserRole[]> {
    const res = await db.query<UserRole>('SELECT user_id, role_id, project_id FROM user_roles');
    return res.rows;
  }
}

export const rbacRepository = new RbacRepository();
