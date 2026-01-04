import express, { Request, Response } from 'express';
import routes from './routes';

const app = express();
app.use(express.json());

app.use('/health', () => (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', routes);

export default app;
