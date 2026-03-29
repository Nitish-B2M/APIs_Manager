import { Request, Response, NextFunction } from 'express';
import { verifyJwt, UserPayload } from '../utils/jwt';
import { ApiResponse } from '../utils/response';

export interface AuthRequest extends Request {
    user?: UserPayload;
    requestId?: string;
}

/**
 * Required auth middleware.
 * Only accepts Bearer token from Authorization header (not query params).
 */
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        res.status(401).json(ApiResponse.error({ message: 'Authentication required' }));
        return;
    }

    const decoded = verifyJwt(token);
    if (!decoded) {
        res.status(401).json(ApiResponse.error({ message: 'Authentication required' }));
        return;
    }

    req.user = decoded;
    next();
};

/**
 * Optional auth middleware — doesn't fail if no token.
 */
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
