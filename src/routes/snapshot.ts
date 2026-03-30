import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { snapshotService } from '../services/snapshotService';
import { ApiResponse } from '../utils/response';
import { checkAccess, canEdit, canAdmin } from '../utils/rbac';
import { query } from '../utils/db';
import { catchAsync } from '../utils/catchAsync';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'SnapshotService';
const router = Router();

// Create snapshot
router.post('/create', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { documentationId, name } = req.body;
        if (!documentationId || !name) {
            res.status(400).json(ApiResponse.error({ message: 'Missing documentationId or name' }));
            return;
        }

        const access = await checkAccess(documentationId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required to create snapshots' }));
            return;
        }

        const snapshot = await snapshotService.createSnapshot(documentationId, name);
        res.json(ApiResponse.success({
            message: 'Snapshot created successfully',
            data: snapshot
        }));
        return;
    } catch (error: any) {
        logErrorReport('POST /snapshot/create', SERVICE_NAME, error, ERROR_CODES.SNAPSHOT_CREATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

// List snapshots for a documentation
router.get('/list/:documentationId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;

        const access = await checkAccess(documentationId, req.user!.userId);
        if (!access.hasAccess) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        const snapshots = await snapshotService.listSnapshots(documentationId);
        res.json(ApiResponse.success({
            message: 'Snapshots fetched successfully',
            data: snapshots
        }));
        return;
    } catch (error: any) {
        logErrorReport('GET /snapshot/list/:documentationId', SERVICE_NAME, error, ERROR_CODES.SNAPSHOT_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

// Get individual snapshot
router.get('/:snapshotId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const snapshotId = req.params.snapshotId as string;
        const { rows: snapshots } = await query('SELECT * FROM snapshots WHERE id = $1', [snapshotId]);

        if (!snapshots[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Snapshot not found' }));
            return;
        }

        const access = await checkAccess(snapshots[0].documentationId, req.user!.userId);
        if (!access.hasAccess) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Access required to view snapshots' }));
            return;
        }

        res.json(ApiResponse.success({
            message: 'Snapshot fetched successfully',
            data: snapshots[0]
        }));
        return;
    } catch (error: any) {
        logErrorReport('GET /snapshot/:snapshotId', SERVICE_NAME, error, ERROR_CODES.SNAPSHOT_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

// Restore snapshot
router.post('/restore/:snapshotId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const snapshotId = req.params.snapshotId as string;

        const { rows: snapshots } = await query('SELECT "documentationId" FROM snapshots WHERE id = $1', [snapshotId]);
        if (!snapshots[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Snapshot not found' }));
            return;
        }

        const access = await checkAccess(snapshots[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required to restore snapshots' }));
            return;
        }

        const result = await snapshotService.restoreSnapshot(snapshotId);
        res.json(ApiResponse.success(result));
        return;
    } catch (error: any) {
        logErrorReport('POST /snapshot/restore/:snapshotId', SERVICE_NAME, error, ERROR_CODES.SNAPSHOT_RESTORE_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

// Delete snapshot
router.delete('/:snapshotId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const snapshotId = req.params.snapshotId as string;

        const { rows: snapshots } = await query('SELECT "documentationId" FROM snapshots WHERE id = $1', [snapshotId]);
        if (!snapshots[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Snapshot not found' }));
            return;
        }

        const access = await checkAccess(snapshots[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required to delete snapshots' }));
            return;
        }

        await snapshotService.deleteSnapshot(snapshotId);
        res.json(ApiResponse.success({ message: 'Snapshot deleted successfully' }));
        return;
    } catch (error: any) {
        logErrorReport('DELETE /snapshot/:snapshotId', SERVICE_NAME, error, ERROR_CODES.SNAPSHOT_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message }));
        return;
    }
}));

export default router;
