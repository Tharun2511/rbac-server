import { Roles } from '../constant/allowedRoles';

export interface User {
    id: string;
    email: string;
    password_hash: string;
    is_active: boolean;
    role: Roles;
}
