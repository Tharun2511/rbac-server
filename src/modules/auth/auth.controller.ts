import { Request, Response } from 'express';
import * as authService from './auth.service';

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: 'Email and Password are required' });

  try {
    const result = await authService.login(email, password);
    return res.status(200).json(result);
  } catch {
    return res.status(401).json({ message: 'Invalid Credentials' });
  }
};
