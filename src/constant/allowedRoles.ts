export const allowedRoles = ['USER', 'MANAGER', 'RESOLVER', 'ADMIN'];

export type Roles = typeof allowedRoles[number];
