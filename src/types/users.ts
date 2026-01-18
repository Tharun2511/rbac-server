import { Roles } from '../constant/allowedRoles';

export interface User {
    id: string;
    email: string;
    passwordHash: string;
    isActive: boolean;
    role: Roles;
}
