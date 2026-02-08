export interface Role {
  id: string;
  name: string;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
}

export interface UserRole {
  user_id: string;
  role_id: string;
  project_id: string | null; // Can be null if global role? But schema says it's project scoped usually. The user request says "project scoped".
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
}
