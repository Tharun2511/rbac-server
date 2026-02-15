export interface User {
    id: string;
    email: string;
    passwordHash: string;
    isActive: boolean;
    isSystemAdmin: boolean;
    name: string;
}
