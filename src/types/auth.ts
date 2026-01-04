export interface AuthUser {
  userId: string;
  role: 'USER' | 'MANAGER' | 'RESOLVER' | 'ADMIN';
}
