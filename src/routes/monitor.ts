import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../utils/response';
import * as monitorService from '../services/monitorService';
import { checkAccess, canEdit, canAdmin } from '../utils/rbac';
import { query } from '../utils/db';
import { catchAsync } from '../utils/catchAsync';
import { z } from 'zod';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'MonitorService';
const router = Router();

const createMonitorSchema = z.object({
    documentationId: z.string().uuid(),
    requestId: z.string().uuid().optional(),
    name: z.string().min(1).max(200),
    url: z.string().url(),
    method: z.string().default('GET'),
    headers: z.any().optional(),
    body: z.any().optional(),
    frequency: z.string().default('*/5 * * * *'),
    notifyEmail: z.string().email().optional(),
    webhookUrl: z.string().url().optional(),
    webhookType: z.string().optional(),
    webhookSecret: z.string().optional(),
});

// Create monitor
router.post('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = createMonitorSchema.parse(req.body);

        const access = await checkAccess(data.documentationId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required to create monitors' }));
            return;
        }

        const monitor = await monitorService.createMonitor(data);
        res.json(ApiResponse.success({ message: 'Monitor created', data: monitor }));
    } catch (error: any) {
        if (error.name === 'ZodError') {
            res.status(400).json(ApiResponse.error({ message: error.errors?.[0]?.message || 'Validation failed' }));
            return;
        }
        logErrorReport('POST /monitor', SERVICE_NAME, error, ERROR_CODES.MONITOR_CREATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to create monitor' }));
    }
}));

// List monitors for a documentation
router.get('/list/:documentationId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
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
        logErrorReport('GET /monitor/list/:documentationId', SERVICE_NAME, error, ERROR_CODES.MONITOR_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

// Get monitor history (for charting)
router.get('/:monitorId/history', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
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
        logErrorReport('GET /monitor/:monitorId/history', SERVICE_NAME, error, ERROR_CODES.MONITOR_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

// Trigger manual check
router.post('/:monitorId/check', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
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
        logErrorReport('POST /monitor/:monitorId/check', SERVICE_NAME, error, ERROR_CODES.MONITOR_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

// Update monitor
router.patch('/:monitorId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
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
        logErrorReport('PATCH /monitor/:monitorId', SERVICE_NAME, error, ERROR_CODES.MONITOR_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

// Delete monitor
router.delete('/:monitorId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
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
        logErrorReport('DELETE /monitor/:monitorId', SERVICE_NAME, error, ERROR_CODES.MONITOR_DELETE_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

// Get public status page data
router.get('/public/:slug', catchAsync(async (req: import('express').Request, res: Response) => {
    try {
        const slug = req.params.slug as string;
        const statusData = await monitorService.getPublicStatus(slug);

        if (!statusData) {
            res.status(404).json(ApiResponse.error({ message: 'Status page not found or private' }));
            return;
        }

        res.json(ApiResponse.success({ message: 'Status fetched', data: statusData }));
        return;
    } catch (error: any) {
        logErrorReport('GET /monitor/public/:slug', SERVICE_NAME, error, ERROR_CODES.MONITOR_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

// Get heatmap data for a monitor
router.get('/:monitorId/heatmap', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
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

        const heatmap = await monitorService.getMonitorHeatmap(monitorId);
        res.json(ApiResponse.success({ message: 'Heatmap fetched', data: heatmap }));
        return;
    } catch (error: any) {
        logErrorReport('GET /monitor/:monitorId/heatmap', SERVICE_NAME, error, ERROR_CODES.MONITOR_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

export default router;
