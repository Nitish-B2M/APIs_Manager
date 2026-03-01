import { expect, test, describe, vi, beforeEach } from 'vitest';
import { adminMiddleware } from '../middleware/adminAuth';
import { query } from '../utils/db';

vi.mock('../utils/db', () => ({
    query: vi.fn(),
}));

describe('Admin RBAC Middleware', () => {
    let req: any;
    let res: any;
    let next: any;

    beforeEach(() => {
        req = {
            user: { userId: 'user-123' }
        };
        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        next = vi.fn();
        vi.clearAllMocks();
    });

    test('should allow access if user is admin', async () => {
        (query as any).mockResolvedValueOnce({ rows: [{ is_admin: true }] });

        await adminMiddleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('should deny access if user is not admin', async () => {
        (query as any).mockResolvedValueOnce({ rows: [{ is_admin: false }] });

        await adminMiddleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should deny access if user not found', async () => {
        (query as any).mockResolvedValueOnce({ rows: [] });

        await adminMiddleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should handle database errors', async () => {
        (query as any).mockRejectedValueOnce(new Error('DB Error'));

        await adminMiddleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
