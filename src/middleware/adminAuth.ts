import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';

export const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.userId) {
        res.status(401).json(ApiResponse.error({ message: 'Unauthorized' }));
        return;
    }

    try {
        const { rows } = await query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);

        if (rows.length === 0 || !rows[0].is_admin) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required' }));
            return;
        }

        next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        res.status(500).json(ApiResponse.error({ message: 'Internal server error' }));
    }
};
