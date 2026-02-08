# 🔐 Internal Workflow & Ticket Management Platform - RBAC System Documentation

## Overview

This documentation outlines the Role-Based Access Control (RBAC) system implemented for the **Internal Workflow & Ticket Management Platform**. The system provides granular, project-scoped authorization capabilities using a high-performance **In-Memory Registry** pattern.

Instead of hitting the database for every permission check (O(N) queries), the system loads the entire RBAC graph (Roles, Permissions, User Mappings) into memory at startup (O(1) checks). This approach is similar to enterprise systems like **AWS IAM** or **Jira Data Center**.

## 🏗️ Architecture

The RBAC module follows a clean separation of concerns:

```mermaid
graph TD
    DB[(PostgreSQL)] -->|1. Load on Boot/Refresh| Repo[RbacRepository]
    Repo -->|2. Transformed Scope Map| Registry[RbacRegistry (Singleton)]
    Registry -->|3. Resolves Access| Middleware[RbacMiddleware]
    FE[FrontEnd Client] -->|4. Request + Token + ProjectID| Middleware
    Middleware -->|5. Authorized| Controller[Controller (Protected Route)]
```

### Key Components

| Component | File Path | Role |
| :--- | :--- | :--- |
| **Repository** | `src/modules/rbac/rbac.repository.ts` | **Data Layer**: Executes raw SQL queries to fetch `roles`, `permissions`, `role_permissions`, and `user_roles`. |
| **Registry** | `src/modules/rbac/rbac.registry.ts` | **Core Logic**: Singleton that initializes on server start. Holds the `userRoles` and `rolePermissions` maps in memory. Resolves `userHasPermission(userId, projectId, permission)`. |
| **Middleware** | `src/common/middleware/rbac.middleware.ts` | **Gatekeeper**: Express middleware to protect routes. Extracts `projectId` from URL/Headers and calls the Registry. |
| **Service** | `src/modules/rbac/rbac.service.ts` | **Orchestrator**: Simple service mainly for triggering reloads or complex business logic related to RBAC management. |
| **Routes** | `src/modules/rbac/rbac.routes.ts` | **API**: Exposes endpoints like `POST /api/rbac/refresh` to hot-reload the cache without restarting the server. |

## 🚀 Usage

### 1. Protecting Routes

To protect a route, use the `requirePermission` or `requireRole` middleware.

**By Permission (Granular - Recommended)**
This checks if the user has the specific capability required for the action.

```typescript
import { requirePermission } from '../../common/middleware/rbac.middleware';

// Only users with "ticket.create" permission in this project OR globally can access
router.post(
  '/:projectId/tickets',
  requirePermission('ticket.create'),
  createTicketController
);
```

**By Role (Coarse - Use sparingly)**
Checks if the user holds a specific role name (e.g., 'manager').

```typescript
import { requireRole } from '../../common/middleware/rbac.middleware';

// Only 'manager' role can access this reporting route
router.get(
  '/:projectId/reports',
  requireRole('manager'),
  getReportsController
);
```

### 2. Passing Project Context

The middleware automatically attempts to resolve the `projectId` involved in the request to scope the permission check correctly. It looks in the following order:

1.  **URL Parameters**: `/projects/:projectId/...` (Preferred)
2.  **Headers**: `x-project-id: <uuid>` (Useful for global-style APIs acting on a project context)
3.  **Request Body**: `{ "projectId": "<uuid>" }` (For POST/PUT payloads)
4.  **Query String**: `?projectId=<uuid>`

If no `projectId` is found, the system checks purely against **Global Roles** (roles assigned across the entire organization, not scoped to a project).

### 3. Hot Reloading Permissions

If you modify roles or permissions in the database directly (or via a future Admin UI), the in-memory cache will be stale. You can refresh it without restarting:

**Endpoint:** `POST /api/rbac/refresh`
**Auth:** Requires `admin` role (or superuser token).

```bash
curl -X POST http://localhost:4000/api/rbac/refresh \
  -H "Authorization: Bearer <admin_token>"
```

## 🧠 Data Design & Caching Logic

### Database Schema (Source of Truth)
The system relies on 4 core tables:
1.  `roles`: Standard definitions (Admin, Manager, Resolver, User).
2.  `permissions`: Granular actions (ticket.create, dashboard.view).
3.  `role_permissions`: Mappings of what roles can do what.
4.  `user_roles`: The crucial bind. Why is it powerful?
    *   It includes a `project_id` column.
    *   This allows a user to be a **Manager** in _Project A_ but only a **Viewer** in _Project B_.

### In-Memory Structures (Optimized for O(1))

When `RbacRegistry.init()` runs, it builds:

1.  **RolePermissions Map**:
    ```typescript
    Map<RoleId, Set<PermissionName>>
    // Example: "role_admin_uuid" -> {"ticket.create", "ticket.delete", ...}
    ```

2.  **UserRoles Map**:
    ```typescript
    Map<UserId, Map<ContextKey, Set<RoleId>>>
    // Structure:
    // user_123 -> {
    //    "project_abc": {"role_manager_uuid"},
    //    "project_xyz": {"role_viewer_uuid"},
    //    "global":      {"role_employee_uuid"}
    // }
    ```

### Resolution Algorithm `userHasPermission(userId, projectId, permission)`

1.  Retrieve the `Map` for the given `userId`.
2.  Identify roles relevant to the request:
    *   Add roles from `Project Map (projectId)`
    *   Add roles from `Global Map ('global')`
3.  For each gathered Role ID:
    *   Look up its permissions in `RolePermissions Map`.
    *   If `permission` is found in the Set -> **GRANT ACCESS**.
4.  If loop finishes without finding the permission -> **DENY ACCESS**.

## 🛡️ Security Considerations

*   **Fail Closed**: If the registry fails to load or the user has no roles, access is denied (returns `false` / `403 Forbidden`).
*   **Token Agnostic**: The system does NOT embed permissions in the JWT. This keeps tokens small and secure. It decodes the `userId` from the token and checks live permissions against the Registry.
*   **Auditability**: Middleware logs failures (403s), helping admins trace unauthorized access attempts.

## 🤝 Troubleshooting

**Q: I added a permission in DB but it's not working?**
A: Did you call `/api/rbac/refresh` or restart the server? The registry caches data on startup.

**Q: A user is an Admin but gets 403?**
A: Check if the Admin role is assigned globally or to the correct project. If the route expects a `projectId` but the admin role is only on proper project, ensure the project ID is being sent correctly in the request.

---
*Maintained by the Backend Engineering Team*
