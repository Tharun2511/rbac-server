# Backend Coding Guidelines

## Architecture — Layered Pattern

Every module must follow this strict layering. **Never skip a layer.**

```
Routes → Controller → Service → Repository → Database
```

| Layer | Responsibility | Rules |
|-------|---------------|-------|
| **Routes** | HTTP verb + path + middleware | No business logic. Only `router.get/post/...` calls. Always apply `authMiddleware` + `rbacMiddleware` before business routes. |
| **Controller** | Parse request, call service, send response | No SQL. No direct `db.query`. Extract params/body, call service, return `res.json()`. Handle HTTP status codes here. |
| **Service** | Business logic + orchestration | No SQL. Calls repository functions. May call multiple repos. Throws domain errors. |
| **Repository** | Raw SQL queries + data access | **Only place SQL lives.** Returns plain objects/arrays. No `req`/`res` references. No HTTP awareness. |

> [!CAUTION]
> **Never put SQL queries in controllers or services.** All database access goes through repository files only.

---

## File Naming & Structure

```
src/modules/<module>/
  ├── <module>.routes.ts       # Express router
  ├── <module>.controller.ts   # Request handlers
  ├── <module>.service.ts      # Business logic
  └── <module>.repository.ts   # SQL queries
```

- One module per domain concept (auth, tickets, analytics, organizations, projects)
- Shared utilities go in `src/utils/`
- Middleware goes in `src/middlewares/`
- Types/interfaces go in `src/types/`

---

## SQL & Database

1. **Parameterized queries only** — Always use `$1, $2, ...` placeholders. Never interpolate user input.
2. **Column names** — Use `camelCase` with double quotes: `"orgId"`, `"createdAt"`.
3. **Return parsed values** — PostgreSQL `COUNT(*)` returns strings; always `parseInt()` in the repository.
4. **Idempotent migrations** — Use `IF NOT EXISTS`, `ON CONFLICT`, `DROP IF EXISTS`.
5. **Seed scripts** — Must be re-runnable (`ON CONFLICT DO UPDATE/NOTHING`).

```typescript
// ✅ Good — in repository
export const getTicketsByOrg = async (orgId: string) => {
    const result = await db.query(
        `SELECT * FROM tickets WHERE "orgId" = $1 ORDER BY "createdAt" DESC`,
        [orgId]
    );
    return result.rows;
};

// ❌ Bad — SQL in service
export const getTickets = async (orgId: string) => {
    return db.query(`SELECT * FROM tickets WHERE "orgId" = '${orgId}'`);
};
```

---

## Authentication & Authorization

1. **Auth middleware first** — Always `authMiddleware` before `rbacMiddleware` in route files.
2. **Permission-based access** — Use `requirePermission('slug')` not role checks.
3. **Context from headers** — Org/project context comes from `x-org-id` / `x-project-id` headers.
4. **System admins bypass RBAC** — Checked via `user.isSystemAdmin` flag, never by role name.
5. **JWT payload** — Keep minimal: `{ userId, isSystemAdmin }`. No role names in tokens.
6. **Secrets** — Use environment variables. Never hardcode credentials.

---

## Error Handling

1. **Controller-level try/catch** — Controllers catch errors and return appropriate HTTP status codes.
2. **Service-level throws** — Services throw descriptive errors; don't catch silently.
3. **Consistent error shape** — Always return `{ error: string }` on failure.
4. **Status codes** — `400` bad request, `401` unauthenticated, `403` forbidden, `404` not found, `500` server error.

```typescript
// Controller pattern
export const getTicket = async (req: Request, res: Response) => {
    try {
        const ticket = await ticketService.getById(req.params.id, req.user.orgId);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
```

---

## TypeScript

1. **No `any`** — Use specific types. If truly unknown, use `unknown` and narrow.
2. **Export interfaces** from service/repository for return types.
3. **Async/await** — No raw `.then()` chains.
4. **Use `const` by default** — Only `let` when reassignment is needed. Never `var`.

---

## General

- **No console.log in production code** — Use a logger (e.g., `morgan` for HTTP, custom for app logs).
- **Environment config** — All config from `.env` via `process.env`, centralized in `src/config/`.
- **No hardcoded URLs, ports, or secrets**.
- **Keep controllers thin** — Delegate all logic to services.
