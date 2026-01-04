import { NextFunction, Request, Response } from 'express';
import { allowedRoles } from '../constant/allowedRoles';

const authorizeMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!allowedRoles.includes(req.user.role)) {
    res.status(403).json({ message: 'Fobidden' });
  }
  next();
};

export default authorizeMiddleware;
