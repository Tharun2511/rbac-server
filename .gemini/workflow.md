# Development Workflow

## 🌿 Git Strategy
- **Branching Model**: Feature Branch Workflow.
    - `main` / `master`: Production-ready code.
    - `feature/your-feature-name`: New features.
    - `bugfix/issue-description`: Bug fixes.
    - `hotfix/urgent-fix`: Production hotfixes.

- **Commit Messages**: Conventional Commits (Optional but recommended).
    - `feat: add user login`
    - `fix: resolve null pointer in auth`
    - `docs: update readme`
    - `chore: update dependencies`

## 🧪 Testing Strategy
- **Currently**: Manual testing with logical checks.
- **Future**: Implement unit and integration tests using Jest or Mocha.
- **Pre-commit**: Run `npm run format` and `npm run build` locally before pushing to ensure code quality.

## 🚀 Deployment (Conceptual)
1.  **Build**: `npm run build` (Compiles TS to JS in `dist/`).
2.  **Environment**: Ensure `.env` is configured on the server.
3.  **Start**: `npm start` (Runs `node dist/server.js`).
