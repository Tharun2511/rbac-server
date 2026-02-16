import { AuthUser } from './auth';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      permissions?: Set<string>;
      context?: {
        orgId?: string;
        projectId?: string;
        roleId?: string;
      };
    }
  }
}
