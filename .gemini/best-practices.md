# Best Practices

## 🔒 Security
- **Input Validation**: Validate all incoming data at the Controller level.
- **Authentication**: Usage of JWT for stateless authentication.
- **Authorization**: Role-Based Access Control (RBAC) middleware for protected routes.
- **Secrets**: Never commit secrets. Use `.env` file and `dotenv`.
- **SQL Injection**: ALWAYS use parameterized queries (e.g., `$1, $2`) to prevent SQL injection.

## 🚀 Performance
- **Database Indexing**: Ensure foreign keys and frequently queried columns are indexed.
- **Efficient Queries**: Select only necessary columns (e.g., avoid `SELECT *` unless needed).
- **Connection Pooling**: Use the `pg` pool for managing database connections efficiently.

## ⚠️ Error Handling
- **Centralized Handling**: Use a global error handling middleware in `app.ts`.
- **Custom Errors**: Create custom error classes (e.g., `AppError`, `NotFoundError`) for consistent error responses.
- **Graceful Shutdown**: Handle `SIGTERM` and `SIGINT` signals to close DB connections and server gracefully.

## 📝 Logging
- **Structured Logging**: Use a logging library (e.g., `winston` or `morgan`) for structured logs.
- **Levels**: Use appropriate log levels (`info`, `warn`, `error`, `debug`).
