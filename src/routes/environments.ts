import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { query } from '../utils/db';
import { z } from 'zod';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { checkAccess, canEdit, canAdmin } from '../utils/rbac';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'EnvironmentService';
const router = Router();

// ============================================
// COLLECTION SCOPED ROUTES
// ============================================

// Get all environments for a documentation
router.get('/:documentationId/environments', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;

        const access = await checkAccess(documentationId, req.user!.userId);
        if (!access.hasAccess) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        const { rows: environments } = await query(
            `SELECT * FROM environments 
             WHERE "documentationId" = $1 AND "scope" = 'COLLECTION'
             ORDER BY "order" ASC`,
            [documentationId]
        );

        res.json(ApiResponse.success({
            message: 'Environments fetched successfully',
            data: environments,
        }));
    } catch (error: any) {
        logErrorReport('getEnvironments', SERVICE_NAME, error, ERROR_CODES.ENV_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch environments' }));
    }
});

// Create a new collection environment
router.post('/:documentationId/environments', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;
        const schema = z.object({
            name: z.string().min(1).max(50),
            variables: z.record(z.string()).optional().default({}),
            isActive: z.boolean().optional().default(false),
            secrets: z.array(z.string()).optional().default([])
        });

        const input = schema.parse(req.body);

        const access = await checkAccess(documentationId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required' }));
            return;
        }

        await query('BEGIN');

        try {
            if (input.isActive) {
                await query(
                    'UPDATE environments SET "isActive" = false WHERE "documentationId" = $1 AND "scope" = \'COLLECTION\'',
                    [documentationId]
                );
            }

            const { rows: countRes } = await query(
                `SELECT COALESCE(MAX("order"), -1) + 1 as next_order 
                 FROM environments 
                 WHERE "documentationId" = $1 AND "scope" = \'COLLECTION\'`,
                [documentationId]
            );
            const nextOrder = countRes[0].next_order;

            const { rows } = await query(
                `INSERT INTO environments ("documentationId", "userId", name, variables, "isActive", "order", "scope", "secrets") 
                 VALUES ($1, $2, $3, $4, $5, $6, 'COLLECTION', $7) RETURNING *`,
                [documentationId, req.user!.userId, input.name, JSON.stringify(input.variables), input.isActive, nextOrder, JSON.stringify(input.secrets)]
            );

            await query('COMMIT');

            res.json(ApiResponse.success({
                message: 'Environment created successfully',
                data: rows[0],
            }));
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error: any) {
        logErrorReport('createEnvironment', SERVICE_NAME, error, ERROR_CODES.ENV_CREATE_FAILED);
        res.status(400).json(ApiResponse.error({ message: 'Failed to create environment' }));
    }
});

// Set active environment for collection
router.patch('/:documentationId/environments/set-active', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const documentationId = req.params.documentationId as string;
        const schema = z.object({
            environmentId: z.string().uuid().nullable()
        });

        const input = schema.parse(req.body);

        const access = await checkAccess(documentationId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required' }));
            return;
        }

        await query('BEGIN');

        try {
            await query(
                'UPDATE environments SET "isActive" = false WHERE "documentationId" = $1 AND "scope" = \'COLLECTION\'',
                [documentationId]
            );

            if (input.environmentId) {
                await query(
                    'UPDATE environments SET "isActive" = true WHERE id = $1 AND "documentationId" = $2 AND "scope" = \'COLLECTION\'',
                    [input.environmentId, documentationId]
                );
            }

            await query('COMMIT');

            const { rows: environments } = await query(
                'SELECT * FROM environments WHERE "documentationId" = $1 AND "scope" = \'COLLECTION\' ORDER BY "order" ASC',
                [documentationId]
            );

            res.json(ApiResponse.success({
                message: input.environmentId ? 'Active environment updated' : 'No active environment set',
                data: environments,
            }));
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error: any) {
        logErrorReport('setActiveEnvironment', SERVICE_NAME, error, ERROR_CODES.ENV_SET_ACTIVE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to set active environment' }));
    }
});

// ============================================
// GLOBAL SCOPED ROUTES
// ============================================

// Get all global environments for current user
router.get('/global/list', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { rows: environments } = await query(
            `SELECT * FROM environments 
             WHERE "userId" = $1 AND "scope" = 'GLOBAL'
             ORDER BY "order" ASC`,
            [req.user!.userId]
        );

        res.json(ApiResponse.success({
            message: 'Global environments fetched successfully',
            data: environments,
        }));
    } catch (error: any) {
        logErrorReport('getGlobalEnvironments', SERVICE_NAME, error, ERROR_CODES.ENV_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch global environments' }));
    }
});

// Create a new global environment
router.post('/global', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            name: z.string().min(1).max(50),
            variables: z.record(z.string()).optional().default({}),
            isActive: z.boolean().optional().default(false),
            secrets: z.array(z.string()).optional().default([])
        });

        const input = schema.parse(req.body);

        await query('BEGIN');

        try {
            if (input.isActive) {
                await query(
                    'UPDATE environments SET "isActive" = false WHERE "userId" = $1 AND "scope" = \'GLOBAL\'',
                    [req.user!.userId]
                );
            }

            const { rows: countRes } = await query(
                `SELECT COALESCE(MAX("order"), -1) + 1 as next_order 
                 FROM environments 
                 WHERE "userId" = $1 AND "scope" = \'GLOBAL\'`,
                [req.user!.userId]
            );
            const nextOrder = countRes[0].next_order;

            const { rows } = await query(
                `INSERT INTO environments ("userId", name, variables, "isActive", "order", "scope", "secrets") 
                 VALUES ($1, $2, $3, $4, $5, 'GLOBAL', $6) RETURNING *`,
                [req.user!.userId, input.name, JSON.stringify(input.variables), input.isActive, nextOrder, JSON.stringify(input.secrets)]
            );

            await query('COMMIT');

            res.json(ApiResponse.success({
                message: 'Global environment created successfully',
                data: rows[0],
            }));
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error: any) {
        logErrorReport('createGlobalEnvironment', SERVICE_NAME, error, ERROR_CODES.ENV_CREATE_FAILED);
        res.status(400).json(ApiResponse.error({ message: 'Failed to create global environment' }));
    }
});

// Set active global environment
router.patch('/global/set-active', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            environmentId: z.string().uuid().nullable()
        });

        const input = schema.parse(req.body);

        await query('BEGIN');

        try {
            await query(
                'UPDATE environments SET "isActive" = false WHERE "userId" = $1 AND "scope" = \'GLOBAL\'',
                [req.user!.userId]
            );

            if (input.environmentId) {
                await query(
                    'UPDATE environments SET "isActive" = true WHERE id = $1 AND "userId" = $2 AND "scope" = \'GLOBAL\'',
                    [input.environmentId, req.user!.userId]
                );
            }

            await query('COMMIT');

            const { rows: environments } = await query(
                'SELECT * FROM environments WHERE "userId" = $1 AND "scope" = \'GLOBAL\' ORDER BY "order" ASC',
                [req.user!.userId]
            );

            res.json(ApiResponse.success({
                message: input.environmentId ? 'Active global environment updated' : 'No active global environment set',
                data: environments,
            }));
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error: any) {
        logErrorReport('setActiveGlobalEnvironment', SERVICE_NAME, error, ERROR_CODES.ENV_SET_ACTIVE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to set active global environment' }));
    }
});

// ============================================
// COMMON ROUTES (Shared for both scopes)
// ============================================

// Update an environment (handles global or collection)
router.patch('/environments/:environmentId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { environmentId } = req.params;
        const schema = z.object({
            name: z.string().min(1).max(50).optional(),
            variables: z.record(z.string()).optional(),
            isActive: z.boolean().optional(),
            order: z.number().optional(),
            secrets: z.array(z.string()).optional()
        });

        const input = schema.parse(req.body);

        // Fetch the environment first
        const { rows: envs } = await query(
            `SELECT * FROM environments WHERE id = $1`,
            [environmentId]
        );

        if (!envs[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Environment not found' }));
            return;
        }

        const env = envs[0];

        // Ensure authorization based on scope
        if (env.scope === 'GLOBAL') {
            if (env.userId !== req.user!.userId) {
                res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
                return;
            }
        } else if (env.scope === 'COLLECTION') {
            const access = await checkAccess(env.documentationId, req.user!.userId);
            if (!access.hasAccess || !canEdit(access.role)) {
                res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required' }));
                return;
            }
        }

        await query('BEGIN');

        try {
            if (input.isActive) {
                if (env.scope === 'GLOBAL') {
                    await query(
                        'UPDATE environments SET "isActive" = false WHERE "userId" = $1 AND "scope" = \'GLOBAL\' AND id != $2',
                        [req.user!.userId, environmentId]
                    );
                } else {
                    await query(
                        'UPDATE environments SET "isActive" = false WHERE "documentationId" = $1 AND "scope" = \'COLLECTION\' AND id != $2',
                        [env.documentationId, environmentId]
                    );
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
            if (input.variables !== undefined) {
                updates.push(`variables = $${count}`);
                values.push(JSON.stringify(input.variables));
                count++;
            }
            if (input.isActive !== undefined) {
                updates.push(`"isActive" = $${count}`);
                values.push(input.isActive);
                count++;
            }
            if (input.order !== undefined) {
                updates.push(`"order" = $${count}`);
                values.push(input.order);
                count++;
            }
            if (input.secrets !== undefined) {
                updates.push(`secrets = $${count}`);
                values.push(JSON.stringify(input.secrets));
                count++;
            }

            if (updates.length === 0) {
                await query('ROLLBACK');
                res.status(400).json(ApiResponse.error({ message: 'No fields to update' }));
                return;
            }

            values.push(environmentId);
            const { rows: updatedEnv } = await query(
                `UPDATE environments SET ${updates.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $${count} RETURNING *`,
                values
            );

            await query('COMMIT');

            res.json(ApiResponse.success({
                message: 'Environment updated successfully',
                data: updatedEnv[0],
            }));
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error: any) {
        logErrorReport('updateEnvironment', SERVICE_NAME, error, ERROR_CODES.ENV_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update environment' }));
    }
});

// Delete an environment
router.delete('/environments/:environmentId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { environmentId } = req.params;

        const { rows: envs } = await query(
            `SELECT * FROM environments WHERE id = $1`,
            [environmentId]
        );

        if (!envs[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Environment not found' }));
            return;
        }

        const env = envs[0];

        // Ensure authorization based on scope
        if (env.scope === 'GLOBAL') {
            if (env.userId !== req.user!.userId) {
                res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
                return;
            }
        } else if (env.scope === 'COLLECTION') {
            const access = await checkAccess(env.documentationId, req.user!.userId);
            if (!access.hasAccess || !canAdmin(access.role)) {
                res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required to delete collection environments' }));
                return;
            }
        }

        const { rows } = await query('DELETE FROM environments WHERE id = $1 RETURNING *', [environmentId]);

        res.json(ApiResponse.success({
            message: 'Environment deleted successfully',
            data: rows[0],
        }));
    } catch (error: any) {
        logErrorReport('deleteEnvironment', SERVICE_NAME, error, ERROR_CODES.ENV_DELETE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete environment' }));
    }
});

export default router;
