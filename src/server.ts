import app from './app';
import { env } from './config/env';

const PORT = process.env.PORT || 4000;

app.listen(Number(env.PORT), () => console.log(`🚀 Server running on port ${PORT}`));
