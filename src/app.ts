import express, { Request, Response } from 'express';
import cors from 'cors';

import routes from './routes';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/health', () => (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
});

app.use('/api', routes);

export default app;
