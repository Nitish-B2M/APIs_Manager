import { Router, Response } from 'express';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';

const router = Router();

// List notifications (paginated)
router.get('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const pg = parsePagination(req, { limit: 30 });
    const userId = req.user!.userId;

    const countResult = await query('SELECT COUNT(*) FROM notifications WHERE "userId" = $1', [userId]);
    const total = parseInt(countResult.rows[0].count, 10);

    const { rows } = await query(
        'SELECT * FROM notifications WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3',
        [userId, pg.limit, pg.offset]
    );

    const unreadCount = await query('SELECT COUNT(*) FROM notifications WHERE "userId" = $1 AND read = false', [userId]);

    res.json(ApiResponse.success({
        message: 'Notifications fetched',
        data: { notifications: rows, unreadCount: parseInt(unreadCount.rows[0].count, 10) },
        pagination: buildPaginationMeta(total, pg),
    }));
}));

// Mark as read
router.patch('/:id/read', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    await query('UPDATE notifications SET read = true WHERE id = $1 AND "userId" = $2', [req.params.id, req.user!.userId]);
    res.json(ApiResponse.success({ message: 'Marked as read' }));
}));

// Mark all as read
router.patch('/read-all', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    await query('UPDATE notifications SET read = true WHERE "userId" = $1 AND read = false', [req.user!.userId]);
    res.json(ApiResponse.success({ message: 'All marked as read' }));
}));

// Delete notification
router.delete('/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    await query('DELETE FROM notifications WHERE id = $1 AND "userId" = $2', [req.params.id, req.user!.userId]);
    res.json(ApiResponse.success({ message: 'Notification deleted' }));
}));

export default router;

// Helper to create notifications from other services
export async function createNotification(userId: string, type: string, title: string, message?: string, link?: string) {
    await query(
        'INSERT INTO notifications ("userId", type, title, message, link) VALUES ($1, $2, $3, $4, $5)',
        [userId, type, title, message || null, link || null]
    );
}
