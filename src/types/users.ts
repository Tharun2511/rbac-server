import { Roles } from '../constant/allowedRoles';

export interface User {
    id: string;
    email: string;
    password: string;
    is_active: boolean;
    role: Roles;
    name: string;
    created_at?: Date;
    updated_at?: Date;
}
