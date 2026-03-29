import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { createNotification } from './notifications';

const router = Router();

// List comments for a request
router.get('/:requestId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const { rows } = await query(
        `SELECT c.*, u.name as "authorName", u.email as "authorEmail", u.avatar_url as "authorAvatar"
         FROM request_comments c JOIN users u ON c."userId" = u.id
         WHERE c."requestId" = $1 ORDER BY c."createdAt" ASC`,
        [req.params.requestId]
    );
    res.json(ApiResponse.success({ message: 'Comments fetched', data: rows }));
}));

// Add comment
const createSchema = z.object({
    content: z.string().min(1).max(2000),
    parentId: z.string().uuid().optional(),
});

router.post('/:requestId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const data = createSchema.parse(req.body);
    const { rows } = await query(
        'INSERT INTO request_comments ("requestId", "userId", content, "parentId") VALUES ($1, $2, $3, $4) RETURNING *',
        [req.params.requestId, req.user!.userId, data.content, data.parentId || null]
    );

    // Notify mentioned users (@username pattern)
    const mentions = data.content.match(/@(\w+)/g);
    if (mentions) {
        for (const mention of mentions) {
            const username = mention.substring(1);
            const { rows: mentionedUsers } = await query('SELECT id FROM users WHERE name = $1 AND id != $2', [username, req.user!.userId]);
            for (const u of mentionedUsers) {
                createNotification(u.id, 'comment_mention', `You were mentioned in a comment`, data.content.substring(0, 100));
            }
        }
    }

    res.json(ApiResponse.success({ message: 'Comment added', data: rows[0] }));
}));

// Update comment
router.patch('/:commentId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(req.body);
    const { rows } = await query(
        'UPDATE request_comments SET content = $1, "updatedAt" = NOW() WHERE id = $2 AND "userId" = $3 RETURNING *',
        [content, req.params.commentId, req.user!.userId]
    );
    if (rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Comment not found' })); return; }
    res.json(ApiResponse.success({ message: 'Comment updated', data: rows[0] }));
}));

// Resolve/unresolve comment
router.patch('/:commentId/resolve', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const { rows } = await query(
        'UPDATE request_comments SET resolved = NOT resolved WHERE id = $1 RETURNING *',
        [req.params.commentId]
    );
    if (rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Comment not found' })); return; }
    res.json(ApiResponse.success({ message: rows[0].resolved ? 'Comment resolved' : 'Comment unresolved', data: rows[0] }));
}));

// Delete comment
router.delete('/:commentId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const result = await query('DELETE FROM request_comments WHERE id = $1 AND "userId" = $2 RETURNING id', [req.params.commentId, req.user!.userId]);
    if (result.rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Comment not found' })); return; }
    res.json(ApiResponse.success({ message: 'Comment deleted' }));
}));

export default router;
