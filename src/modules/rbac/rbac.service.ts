
import { rbacRegistry } from './rbac.registry';

export class RbacService {
  async reloadRegistry() {
    await rbacRegistry.reload();
  }
}

export const rbacService = new RbacService();
