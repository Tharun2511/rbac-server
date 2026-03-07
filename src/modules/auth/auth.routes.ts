import { Router } from 'express';
import * as authController from './auth.controller';
import authMiddleware from '../../middlewares/auth.middleware';
import { loginRateLimiter, refreshRateLimiter } from '../../middlewares/rate-limiter.middleware';

const router = Router();

// ── Rate-limited public endpoints ──────────────────────────────────────────
//
// Middleware chaining: Express runs them LEFT to RIGHT.
//   router.post('/login', loginRateLimiter, authController.login)
//                         ^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^
//                         Runs first         Runs only if rate limiter calls next()
//
// If loginRateLimiter rejects (429), authController.login NEVER executes.
// The request stops at the rate limiter — no password check, no DB query.
//
router.post('/login', loginRateLimiter, authController.login);
router.post('/refresh', refreshRateLimiter, authController.refreshToken);
router.post('/logout', authMiddleware, authController.logout);

// Authenticated endpoints for RBAC context
router.get('/me/contexts', authMiddleware, authController.getContexts);
router.get('/me/permissions', authMiddleware, authController.getPermissions);

export default router;
