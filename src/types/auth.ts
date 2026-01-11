import { Roles } from '../constant/allowedRoles';

export interface AuthUser {
    userId: string;
    role: Roles;
}
