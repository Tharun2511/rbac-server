import { env } from './config/env';
import app from './app';

const PORT = env.PORT || 4000;

import { rbacRegistry } from './modules/rbac/rbac.registry';

import logger from './utils/logger';

const startServer = async () => {
  try {
    await rbacRegistry.init();
    app.listen(Number(env.PORT), () => logger.info(`🚀 Server running on port ${PORT}`));
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
