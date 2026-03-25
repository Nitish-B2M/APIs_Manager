import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { z } from 'zod';
import { checkAccess, canAdmin } from '../utils/rbac';

const router = Router();

// List webhooks for a documentation
router.get('/:documentationId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;
        const access = await checkAccess(documentationId, req.user!.userId);
        if (!access.hasAccess) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        const { rows } = await query(
            'SELECT * FROM webhooks WHERE "documentationId" = $1 ORDER BY "createdAt" DESC',
            [documentationId]
        );
        res.json(ApiResponse.success({ message: 'Webhooks fetched', data: rows }));
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
    }
});

// Create webhook
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            documentationId: z.string().uuid(),
            name: z.string().min(1),
            url: z.string().url(),
            secret: z.string().optional(),
            events: z.array(z.string()).min(1)
        });

        const data = schema.parse(req.body);
        const access = await checkAccess(data.documentationId, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required' }));
            return;
        }

        const { rows } = await query(
            `INSERT INTO webhooks ("documentationId", "userId", name, url, secret, events) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [data.documentationId, req.user!.userId, data.name, data.url, data.secret, JSON.stringify(data.events)]
        );

        res.json(ApiResponse.success({ message: 'Webhook created', data: rows[0] }));
    } catch (error: any) {
        res.status(400).json(ApiResponse.error({ message: error.message }));
    }
});

// Delete webhook
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { rows: webhooks } = await query('SELECT "documentationId" FROM webhooks WHERE id = $1', [id]);
        
        if (!webhooks[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Webhook not found' }));
            return;
        }

        const access = await checkAccess(webhooks[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        await query('DELETE FROM webhooks WHERE id = $1', [id]);
        res.json(ApiResponse.success({ message: 'Webhook deleted' }));
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
    }
});

// List logs for a specific webhook
router.get('/:id/logs', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { rows: webhooks } = await query('SELECT "documentationId" FROM webhooks WHERE id = $1', [id]);
        
        if (!webhooks[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Webhook not found' }));
            return;
        }

        const access = await checkAccess(webhooks[0].documentationId, req.user!.userId);
        if (!access.hasAccess) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        const { rows: logs } = await query(
            'SELECT * FROM webhook_logs WHERE "webhookId" = $1 ORDER BY "deliveredAt" DESC LIMIT 50',
            [id]
        );
        res.json(ApiResponse.success({ message: 'Webhook logs fetched', data: logs }));
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
    }
});

export default router;
