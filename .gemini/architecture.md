# System Architecture

## 🏗 Modular Monolith
The project follows a **Modular Monolith** architecture. The application is divided into feature-based modules (e.g., `users`, `auth`, `rbac`), each containing its own routes, controllers, services, and repositories.

### Directory Structure
```
src/
├── config/         # App configuration (DB, Env)
├── modules/        # Feature modules
│   └── users/
│       ├── user.controller.ts  # Request handling
│       ├── user.service.ts     # Business logic
│       ├── user.repository.ts  # Database access (Raw SQL)
│       └── user.routes.ts      # Route definitions
├── middlewares/    # Custom Express middlewares
├── utils/          # Shared utilities
├── types/          # Global TypeScript types/interfaces
├── app.ts          # Express app setup
└── server.ts       # Server entry point
```

## 🔄 Request Flow
1.  **Route**: The request hits a defined route in `*.routes.ts`.
2.  **Middleware**: Authentication & Validation middlewares run.
3.  **Controller**: Extracts data from `req.body` / `req.params`. Calls Service.
4.  **Service**: Executes business logic. Calls Repository.
5.  **Repository**: Executes raw SQL queries using `pg`. Returns data to Service.
6.  **Response**: Controller sends JSON response to client.

## 💾 Database Layer
- **Pattern**: Repository Pattern.
- **Access**: Raw SQL queries via `pg` library.
- **Transactions**: Use `BEGIN`, `COMMIT`, `ROLLBACK` for multi-step operations.
