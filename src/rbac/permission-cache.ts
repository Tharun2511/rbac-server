// ═══════════════════════════════════════════════════════════════════════════════
// src/rbac/permission-cache.ts — Re-export from Redis-backed implementation
// ═══════════════════════════════════════════════════════════════════════════════
//
// BEFORE (Layer 0): This file contained the full PermissionCache class with
//   an in-memory Map. Every consumer imported { permissionCache } from here.
//
// AFTER (Layer 2): The implementation moved to redis-permission-cache.ts.
//   This file is now a "barrel export" — it re-exports the same name from
//   the new location.
//
// WHY KEEP THIS FILE?
//   Every consumer in the app imports from './permission-cache':
//     - src/server.ts
//     - src/middlewares/rbac.middleware.ts
//     - src/routes.ts
//     - src/modules/auth/auth.service.ts
//
//   By re-exporting, NONE of those files need to change their imports.
//   This is the "facade pattern" — hide implementation changes behind
//   a stable interface.
//
// ═══════════════════════════════════════════════════════════════════════════════

export { permissionCache } from './redis-permission-cache';
