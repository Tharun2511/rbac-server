# Coding Standards

## 📝 Naming Conventions
- **Variables & Functions**: `camelCase` (e.g., `getUserById`, `isActive`)
- **Classes & Interfaces**: `PascalCase` (e.g., `UserController`, `User`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_COUNT`, `DEFAULT_PAGE_SIZE`)
- **Files**: `kebab-case.type.ts` (e.g., `user.controller.ts`, `auth.middleware.ts`)

## 🛡 TypeScript Best Practices
- **Strict Mode**: Always keep `strict: true` in `tsconfig.json`.
- **No `any`**: Avoid using `any`. Use `unknown` if the type is truly not known, or define a specific interface/type.
- **Explicit Returns**: Always define return types for functions, especially public APIs.
- **Interfaces over Types**: Use `interface` for object definitions that might be extended, `type` for unions/intersections.

## ⚡ Asynchronous Code
- **Async/Await**: Prefer `async/await` syntax over raw Promises (`.then()`, `.catch()`).
- **Error Handling**: Use `try/catch` blocks in Controllers to handle errors gracefully.

## 🧹 Code Quality
- **Formatting**: Use Prettier for consistent formatting.
- **Linting**: Address all ESLint warnings/errors (if configured).
- **Comments**: Write JSDoc comments for complex logic, but prefer self-documenting code.
