import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { query } from '../utils/db';
import { z } from 'zod';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { checkAccess, canEdit, canAdmin } from '../utils/rbac';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'FolderService';
const router = Router();

// Get all folders for a documentation
router.get('/:documentationId/folders', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;

        const access = await checkAccess(documentationId, req.user!.userId);
        if (!access.hasAccess) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        const { rows: folders } = await query(
            `SELECT * FROM folders 
             WHERE "documentationId" = $1 
             ORDER BY "parentId" NULLS FIRST, "order" ASC`,
            [documentationId]
        );

        res.json(ApiResponse.success({
            message: 'Folders fetched successfully',
            data: folders,
        }));
    } catch (error: any) {
        logErrorReport('getFolders', SERVICE_NAME, error, ERROR_CODES.FOLDER_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch folders' }));
    }
});

// Create a new folder
router.post('/:documentationId/folders', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;
        const schema = z.object({
            name: z.string().min(1).max(100),
            description: z.string().optional(),
            parentId: z.string().uuid().optional().nullable()
        });

        const input = schema.parse(req.body);

        const access = await checkAccess(documentationId, req.user!.userId);

        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required to create folders' }));
            return;
        }

        if (input.parentId) {
            const { rows: parentFolder } = await query(
                'SELECT id FROM folders WHERE id = $1 AND "documentationId" = $2',
                [input.parentId, documentationId]
            );
            if (!parentFolder[0]) {
                res.status(400).json(ApiResponse.error({ message: 'Parent folder not found' }));
                return;
            }
        }

        const { rows: countRes } = await query(
            `SELECT COALESCE(MAX("order"), -1) + 1 as next_order 
             FROM folders 
             WHERE "documentationId" = $1 AND "parentId" IS NOT DISTINCT FROM $2`,
            [documentationId, input.parentId || null]
        );
        const nextOrder = countRes[0].next_order;

        const { rows } = await query(
            `INSERT INTO folders ("documentationId", name, description, "parentId", "order") 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [documentationId, input.name, input.description || null, input.parentId || null, nextOrder]
        );

        res.json(ApiResponse.success({
            message: 'Folder created successfully',
            data: rows[0],
        }));
    } catch (error: any) {
        logErrorReport('createFolder', SERVICE_NAME, error, ERROR_CODES.FOLDER_CREATE_FAILED);
        res.status(400).json(ApiResponse.error({ message: 'Failed to create folder' }));
    }
});

// Update a folder
router.patch('/folders/:folderId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { folderId } = req.params;
        const schema = z.object({
            name: z.string().min(1).max(100).optional(),
            description: z.string().optional().nullable(),
            parentId: z.string().uuid().optional().nullable(),
            order: z.number().optional()
        });

        const input = schema.parse(req.body);

        const { rows: folders } = await query(
            `SELECT f.*, d."userId" 
             FROM folders f 
             JOIN documentation d ON f."documentationId" = d.id 
             WHERE f.id = $1`,
            [folderId]
        );

        if (!folders[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Folder not found' }));
            return;
        }

        const access = await checkAccess(folders[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required' }));
            return;
        }

        if (input.parentId) {
            const isDescendant = await checkIsDescendant(folderId as string, input.parentId);
            if (isDescendant) {
                res.status(400).json(ApiResponse.error({ message: 'Cannot move folder into its own descendant' }));
                return;
            }
        }

        const updates: string[] = [];
        const values: any[] = [];
        let count = 1;

        if (input.name !== undefined) {
            updates.push(`name = $${count}`);
            values.push(input.name);
            count++;
        }
        if (input.description !== undefined) {
            updates.push(`description = $${count}`);
            values.push(input.description);
            count++;
        }
        if (input.parentId !== undefined) {
            updates.push(`"parentId" = $${count}`);
            values.push(input.parentId);
            count++;
        }
        if (input.order !== undefined) {
            updates.push(`"order" = $${count}`);
            values.push(input.order);
            count++;
        }

        if (updates.length === 0) {
            res.status(400).json(ApiResponse.error({ message: 'No fields to update' }));
            return;
        }

        values.push(folderId);
        const { rows: updatedFolder } = await query(
            `UPDATE folders SET ${updates.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $${count} RETURNING *`,
            values
        );

        res.json(ApiResponse.success({
            message: 'Folder updated successfully',
            data: updatedFolder[0],
        }));
    } catch (error: any) {
        logErrorReport('updateFolder', SERVICE_NAME, error, ERROR_CODES.FOLDER_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update folder' }));
    }
});

// Delete a folder
router.delete('/folders/:folderId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { folderId } = req.params;
        const { moveRequestsToParent } = req.query;

        const { rows: folders } = await query(
            `SELECT f.*, d."userId" 
             FROM folders f 
             JOIN documentation d ON f."documentationId" = d.id 
             WHERE f.id = $1`,
            [folderId]
        );

        if (!folders[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Folder not found' }));
            return;
        }

        const access = await checkAccess(folders[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required to delete folders' }));
            return;
        }

        const folder = folders[0];

        await query('BEGIN');

        try {
            if (moveRequestsToParent === 'true') {
                await query(
                    'UPDATE requests SET "folderId" = $1 WHERE "folderId" = $2',
                    [folder.parentId, folderId]
                );

                await query(
                    'UPDATE folders SET "parentId" = $1 WHERE "parentId" = $2',
                    [folder.parentId, folderId]
                );
            }

            const { rows } = await query('DELETE FROM folders WHERE id = $1 RETURNING *', [folderId]);

            await query('COMMIT');

            res.json(ApiResponse.success({
                message: 'Folder deleted successfully',
                data: rows[0],
            }));
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error: any) {
        logErrorReport('deleteFolder', SERVICE_NAME, error, ERROR_CODES.FOLDER_DELETE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete folder' }));
    }
});

// Move request to folder
router.patch('/request/:requestId/move', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const requestId = req.params.requestId as string;
        const schema = z.object({
            folderId: z.string().uuid().optional().nullable()
        });

        const input = schema.parse(req.body);

        const { rows: requests } = await query(
            `SELECT r.*, d."userId", d.id as "documentationId"
             FROM requests r 
             JOIN documentation d ON r."documentationId" = d.id 
             WHERE r.id = $1`,
            [requestId]
        );

        if (!requests[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Request not found' }));
            return;
        }

        const access = await checkAccess(requests[0].documentationId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required to move requests' }));
            return;
        }

        if (input.folderId) {
            const { rows: folders } = await query(
                'SELECT id FROM folders WHERE id = $1 AND "documentationId" = $2',
                [input.folderId, requests[0].documentationId]
            );
            if (!folders[0]) {
                res.status(400).json(ApiResponse.error({ message: 'Folder not found in this documentation' }));
                return;
            }
        }

        const { rows: updatedRequest } = await query(
            'UPDATE requests SET "folderId" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [input.folderId || null, requestId]
        );

        res.json(ApiResponse.success({
            message: 'Request moved successfully',
            data: updatedRequest[0],
        }));
    } catch (error: any) {
        logErrorReport('moveRequest', SERVICE_NAME, error, ERROR_CODES.FOLDER_MOVE_REQUEST_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to move request' }));
    }
});

// Reorder folders
router.patch('/:documentationId/folders/reorder', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;
        const schema = z.object({
            folders: z.array(z.object({
                id: z.string().uuid(),
                order: z.number(),
                parentId: z.string().uuid().optional().nullable()
            }))
        });

        const input = schema.parse(req.body);

        const access = await checkAccess(documentationId, req.user!.userId);

        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required' }));
            return;
        }

        await query('BEGIN');

        try {
            for (const folder of input.folders) {
                await query(
                    'UPDATE folders SET "order" = $1, "parentId" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3 AND "documentationId" = $4',
                    [folder.order, folder.parentId || null, folder.id, documentationId]
                );
            }

            await query('COMMIT');

            res.json(ApiResponse.success({
                message: 'Folders reordered successfully',
            }));
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error: any) {
        logErrorReport('reorderFolders', SERVICE_NAME, error, ERROR_CODES.FOLDER_REORDER_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to reorder folders' }));
    }
});

// Helper function to check if a folder is a descendant of another
async function checkIsDescendant(folderId: string, potentialDescendantId: string): Promise<boolean> {
    const { rows } = await query(
        `WITH RECURSIVE descendants AS (
            SELECT id, "parentId" FROM folders WHERE id = $1
            UNION ALL
            SELECT f.id, f."parentId" FROM folders f
            JOIN descendants d ON f."parentId" = d.id
        )
        SELECT id FROM descendants WHERE id = $2`,
        [folderId, potentialDescendantId]
    );
    return rows.length > 0;
}

export default router;
