import app from './app';
import { env } from './config/env';
import { permissionCache } from './rbac/permission-cache';

const PORT = env.PORT || 4000;

(async () => {
    try {
        await permissionCache.load();
        app.listen(Number(PORT), () => console.log(`🚀 Server running on port ${PORT}`));
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
})();
