import { Router } from 'express';
import { getManagerAnalytics, getUserAnalytics, getAdminAnalytics, getResolverAnalytics } from './analytics.controller';
import authMiddleware from '../../middlewares/auth.middleware';
import authorize from '../../middlewares/authorize.middleware';

const router = Router();

router.get('/user', authMiddleware, authorize(['USER']), getUserAnalytics);
router.get('/manager', authMiddleware, authorize(['MANAGER', 'ADMIN']), getManagerAnalytics);

router.get('/admin', authMiddleware, authorize(['ADMIN']), getAdminAnalytics);


// For resolver specific analytics
router.get('/resolver', authMiddleware, authorize(['RESOLVER']), getResolverAnalytics);

export default router;
