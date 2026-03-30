import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { addSSEClient, removeSSEClient, getUnreadCount } from '../services/notificationService';
import { adminMiddleware } from '../middleware/adminAuth';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const router = Router();
const SERVICE_NAME = 'NotificationService';

// ─── SSE stream — real-time push ─────────────────────────────────────

router.get('/stream', authMiddleware, (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    // Send initial unread count
    getUnreadCount(userId).then(count => {
        res.write(`data: ${JSON.stringify({ type: 'init', unreadCount: count })}\n\n`);
    });

    addSSEClient(userId, res);

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
        removeSSEClient(userId, res);
    });
});

// ─── List notifications (paginated) ──────────────────────────────────

router.get('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const pg = parsePagination(req, { limit: 30 });
        const userId = req.user!.userId;

        const countResult = await query('SELECT COUNT(*) FROM notifications WHERE "userId" = $1', [userId]);
        const total = parseInt(countResult.rows[0].count, 10);

        const { rows } = await query(
            'SELECT * FROM notifications WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3',
            [userId, pg.limit, pg.offset]
        );

        const unreadCount = await getUnreadCount(userId);

        res.json(ApiResponse.success({
            message: 'Notifications fetched',
            data: { notifications: rows, unreadCount },
            pagination: buildPaginationMeta(total, pg),
        }));
    } catch (error: any) {
        logErrorReport('listNotifications', SERVICE_NAME, error, ERROR_CODES.NOTIFICATION_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch notifications' }));
    }
}));

// ─── Mark as read ────────────────────────────────────────────────────

router.patch('/:id/read', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        await query('UPDATE notifications SET read = true WHERE id = $1 AND "userId" = $2', [req.params.id, req.user!.userId]);
        res.json(ApiResponse.success({ message: 'Marked as read' }));
    } catch (error: any) {
        logErrorReport('markAsRead', SERVICE_NAME, error, ERROR_CODES.NOTIFICATION_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to mark as read' }));
    }
}));

// ─── Mark all as read ────────────────────────────────────────────────

router.patch('/read-all', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const result = await query('UPDATE notifications SET read = true WHERE "userId" = $1 AND read = false', [req.user!.userId]);
        res.json(ApiResponse.success({ message: `${result.rowCount} notifications marked as read` }));
    } catch (error: any) {
        logErrorReport('markAllAsRead', SERVICE_NAME, error, ERROR_CODES.NOTIFICATION_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to mark all as read' }));
    }
}));

// ─── Delete notification ─────────────────────────────────────────────

router.delete('/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        await query('DELETE FROM notifications WHERE id = $1 AND "userId" = $2', [req.params.id, req.user!.userId]);
        res.json(ApiResponse.success({ message: 'Notification deleted' }));
    } catch (error: any) {
        logErrorReport('deleteNotification', SERVICE_NAME, error, ERROR_CODES.NOTIFICATION_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete notification' }));
    }
}));

// ─── Get preferences ─────────────────────────────────────────────────

router.get('/preferences', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query(
            'SELECT code, in_app, email FROM notification_preferences WHERE "userId" = $1',
            [req.user!.userId]
        );
        res.json(ApiResponse.success({ message: 'Preferences fetched', data: rows }));
    } catch (error: any) {
        logErrorReport('getPreferences', SERVICE_NAME, error, ERROR_CODES.NOTIFICATION_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch preferences' }));
    }
}));

// ─── Update preference ───────────────────────────────────────────────

const prefSchema = z.object({
    code: z.string().min(1),
    in_app: z.boolean(),
    email: z.boolean(),
});

router.put('/preferences', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = prefSchema.parse(req.body);
        await query(
            `INSERT INTO notification_preferences ("userId", code, in_app, email) VALUES ($1, $2, $3, $4)
             ON CONFLICT ("userId", code) DO UPDATE SET in_app = $3, email = $4`,
            [req.user!.userId, data.code, data.in_app, data.email]
        );
        res.json(ApiResponse.success({ message: 'Preference updated' }));
    } catch (error: any) {
        logErrorReport('updatePreference', SERVICE_NAME, error, ERROR_CODES.NOTIFICATION_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update preference' }));
    }
}));

// ─── Bulk update preferences ─────────────────────────────────────────

const bulkPrefSchema = z.object({
    preferences: z.array(z.object({
        code: z.string(),
        in_app: z.boolean(),
        email: z.boolean(),
    })),
});

router.put('/preferences/bulk', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { preferences } = bulkPrefSchema.parse(req.body);
        const userId = req.user!.userId;

        for (const pref of preferences) {
            await query(
                `INSERT INTO notification_preferences ("userId", code, in_app, email) VALUES ($1, $2, $3, $4)
                 ON CONFLICT ("userId", code) DO UPDATE SET in_app = $3, email = $4`,
                [userId, pref.code, pref.in_app, pref.email]
            );
        }

        res.json(ApiResponse.success({ message: `${preferences.length} preferences updated` }));
    } catch (error: any) {
        logErrorReport('bulkUpdatePreferences', SERVICE_NAME, error, ERROR_CODES.NOTIFICATION_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to bulk update preferences' }));
    }
}));

// ═══════════════════════════════════════════════════════════════════
// ADMIN: Notification Code Management (stored in DB)
// ═══════════════════════════════════════════════════════════════════

// List all codes
router.get('/codes', authMiddleware, adminMiddleware, catchAsync(async (_req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query('SELECT * FROM notification_codes ORDER BY category, code');
        res.json(ApiResponse.success({ message: 'Notification codes fetched', data: rows }));
    } catch (error: any) {
        logErrorReport('listCodes', SERVICE_NAME, error, ERROR_CODES.NOTIFICATION_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch notification codes' }));
    }
}));

// Create new code
const createCodeSchema = z.object({
    code: z.string().min(5).max(30).regex(/^NOTIFY_[A-Z]+_\d{3}$/, 'Format: NOTIFY_CATEGORY_001'),
    category: z.string().min(1).max(30),
    title: z.string().min(1).max(255),
    description: z.string().max(500).optional(),
    severity: z.enum(['info', 'warn', 'critical']).default('info'),
    default_in_app: z.boolean().default(true),
    default_email: z.boolean().default(false),
});

router.post('/codes', authMiddleware, adminMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = createCodeSchema.parse(req.body);
        const { rows } = await query(
            `INSERT INTO notification_codes (code, category, title, description, severity, default_in_app, default_email)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [data.code, data.category, data.title, data.description || null, data.severity, data.default_in_app, data.default_email]
        );
        res.json(ApiResponse.success({ message: 'Notification code created', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('createCode', SERVICE_NAME, error, ERROR_CODES.NOTIFICATION_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to create notification code' }));
    }
}));

// Update code
router.patch('/codes/:code', authMiddleware, adminMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { code } = req.params;
        const schema = z.object({
            title: z.string().max(255).optional(),
            description: z.string().max(500).optional(),
            severity: z.enum(['info', 'warn', 'critical']).optional(),
            default_in_app: z.boolean().optional(),
            default_email: z.boolean().optional(),
            is_active: z.boolean().optional(),
        });
        const data = schema.parse(req.body);

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;
        if (data.title !== undefined) { fields.push(`title = $${idx}`); values.push(data.title); idx++; }
        if (data.description !== undefined) { fields.push(`description = $${idx}`); values.push(data.description); idx++; }
        if (data.severity !== undefined) { fields.push(`severity = $${idx}`); values.push(data.severity); idx++; }
        if (data.default_in_app !== undefined) { fields.push(`default_in_app = $${idx}`); values.push(data.default_in_app); idx++; }
        if (data.default_email !== undefined) { fields.push(`default_email = $${idx}`); values.push(data.default_email); idx++; }
        if (data.is_active !== undefined) { fields.push(`is_active = $${idx}`); values.push(data.is_active); idx++; }

        if (fields.length === 0) { res.status(400).json(ApiResponse.error({ message: 'No fields to update' })); return; }

        values.push(code);
        const { rows } = await query(`UPDATE notification_codes SET ${fields.join(', ')} WHERE code = $${idx} RETURNING *`, values);
        if (rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Code not found' })); return; }
        res.json(ApiResponse.success({ message: 'Code updated', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('updateCode', SERVICE_NAME, error, ERROR_CODES.NOTIFICATION_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update notification code' }));
    }
}));

// Delete code
router.delete('/codes/:code', authMiddleware, adminMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const result = await query('DELETE FROM notification_codes WHERE code = $1 RETURNING code', [req.params.code]);
        if (result.rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Code not found' })); return; }
        res.json(ApiResponse.success({ message: 'Code deleted' }));
    } catch (error: any) {
        logErrorReport('deleteCode', SERVICE_NAME, error, ERROR_CODES.NOTIFICATION_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete notification code' }));
    }
}));

export default router;
