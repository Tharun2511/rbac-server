import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import routes from './routes';

import logger, { stream } from './utils/logger';

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use(morgan('combined', { stream }));

app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.use('/api', routes);

export default app;
