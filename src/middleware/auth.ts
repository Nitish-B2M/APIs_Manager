import { Request, Response, NextFunction } from 'express';
import { verifyJwt, UserPayload } from '../utils/jwt';

export interface AuthRequest extends Request {
    user?: UserPayload;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const decoded = verifyJwt(token);
    if (!decoded) {
        res.status(401).json({ message: 'Invalid token' });
        return;
    }

    req.user = decoded;
    next();
};

export const optionalAuthMiddleware = (req: AuthRequest, _res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
        const decoded = verifyJwt(token);
        if (decoded) {
            req.user = decoded;
        }
    }
    next();
};
