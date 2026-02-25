import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../utils/response';
import * as monitorService from '../services/monitorService';
import { checkAccess, canEdit, canAdmin } from '../utils/rbac';
import { query } from '../utils/db';

const router = Router();

// Create monitor
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { documentationId, requestId, name, url, method, headers, body, frequency, notifyEmail } = req.body;
        if (!documentationId || !name || !url) {
            res.status(400).json(ApiResponse.error({ message: 'documentationId, name, and url are required' }));
            return;
        }

        const access = await checkAccess(documentationId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required to create monitors' }));
            return;
        }

        const monitor = await monitorService.createMonitor({ documentationId, requestId, name, url, method, headers, body, frequency, notifyEmail });
        res.json(ApiResponse.success({ message: 'Monitor created', data: monitor }));
        return;
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
});

// List monitors for a documentation
router.get('/list/:documentationId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;

        const access = await checkAccess(documentationId, req.user!.userId);
        if (!access.hasAccess) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        const monitors = await monitorService.listMonitors(documentationId);
        res.json(ApiResponse.success({ message: 'Monitors fetched', data: monitors }));
        return;
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
});

// Get monitor history (for charting)
router.get('/:monitorId/history', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const monitorId = req.params.monitorId as string;

        const { rows: monitors } = await query('SELECT "documentationId" FROM monitors WHERE id = $1', [monitorId]);
        if (!monitors[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Monitor not found' }));
            return;
        }

        const access = await checkAccess(monitors[0].documentationId, req.user!.userId);
        if (!access.hasAccess) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Access to documentation required' }));
            return;
        }

        const limit = parseInt(req.query.limit as string) || 100;
        const history = await monitorService.getMonitorHistory(monitorId, limit);
        res.json(ApiResponse.success({ message: 'History fetched', data: history }));
        return;
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
});

// Trigger manual check
router.post('/:monitorId/check', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const monitorId = req.params.monitorId as string;

        const { rows: monitors } = await query('SELECT "documentationId" FROM monitors WHERE id = $1', [monitorId]);
        if (!monitors[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Monitor not found' }));
            return;
        }

        const access = await checkAccess(monitors[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required to trigger checks' }));
            return;
        }

        const result = await monitorService.triggerManualCheck(monitorId);
        res.json(ApiResponse.success({ message: 'Check triggered', data: result }));
        return;
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
});

// Update monitor
router.patch('/:monitorId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const monitorId = req.params.monitorId as string;

        const { rows: monitors } = await query('SELECT "documentationId" FROM monitors WHERE id = $1', [monitorId]);
        if (!monitors[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Monitor not found' }));
            return;
        }

        const access = await checkAccess(monitors[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required to update monitors' }));
            return;
        }

        const monitor = await monitorService.updateMonitor(monitorId, req.body);
        res.json(ApiResponse.success({ message: 'Monitor updated', data: monitor }));
        return;
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
});

// Delete monitor
router.delete('/:monitorId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const monitorId = req.params.monitorId as string;

        const { rows: monitors } = await query('SELECT "documentationId" FROM monitors WHERE id = $1', [monitorId]);
        if (!monitors[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Monitor not found' }));
            return;
        }

        const access = await checkAccess(monitors[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required to delete monitors' }));
            return;
        }

        await monitorService.deleteMonitor(monitorId);
        res.json(ApiResponse.success({ message: 'Monitor deleted' }));
        return;
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
});

export default router;
