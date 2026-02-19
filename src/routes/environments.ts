import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { query } from '../utils/db';
import { z } from 'zod';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'EnvironmentService';
const router = Router();

// Get all environments for a documentation
router.get('/:documentationId/environments', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { documentationId } = req.params;

        const { rows: docs } = await query(
            'SELECT "userId" FROM documentation WHERE id = $1',
            [documentationId]
        );

        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        const { rows: environments } = await query(
            `SELECT * FROM environments 
             WHERE "documentationId" = $1 
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

// Create a new environment
router.post('/:documentationId/environments', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { documentationId } = req.params;
        const schema = z.object({
            name: z.string().min(1).max(50),
            variables: z.record(z.string()).optional().default({}),
            isActive: z.boolean().optional().default(false)
        });

        const input = schema.parse(req.body);

        const { rows: docs } = await query(
            'SELECT "userId" FROM documentation WHERE id = $1',
            [documentationId]
        );

        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        await query('BEGIN');

        try {
            if (input.isActive) {
                await query(
                    'UPDATE environments SET "isActive" = false WHERE "documentationId" = $1',
                    [documentationId]
                );
            }

            const { rows: countRes } = await query(
                `SELECT COALESCE(MAX("order"), -1) + 1 as next_order 
                 FROM environments 
                 WHERE "documentationId" = $1`,
                [documentationId]
            );
            const nextOrder = countRes[0].next_order;

            const { rows } = await query(
                `INSERT INTO environments ("documentationId", name, variables, "isActive", "order") 
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [documentationId, input.name, JSON.stringify(input.variables), input.isActive, nextOrder]
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

// Update an environment
router.patch('/environments/:environmentId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { environmentId } = req.params;
        const schema = z.object({
            name: z.string().min(1).max(50).optional(),
            variables: z.record(z.string()).optional(),
            isActive: z.boolean().optional(),
            order: z.number().optional()
        });

        const input = schema.parse(req.body);

        const { rows: envs } = await query(
            `SELECT e.*, d."userId", e."documentationId"
             FROM environments e 
             JOIN documentation d ON e."documentationId" = d.id 
             WHERE e.id = $1`,
            [environmentId]
        );

        if (!envs[0] || envs[0].userId !== req.user!.userId) {
            res.status(404).json(ApiResponse.error({ message: 'Environment not found' }));
            return;
        }

        const documentationId = envs[0].documentationId;

        await query('BEGIN');

        try {
            if (input.isActive) {
                await query(
                    'UPDATE environments SET "isActive" = false WHERE "documentationId" = $1 AND id != $2',
                    [documentationId, environmentId]
                );
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
            `SELECT e.*, d."userId" 
             FROM environments e 
             JOIN documentation d ON e."documentationId" = d.id 
             WHERE e.id = $1`,
            [environmentId]
        );

        if (!envs[0] || envs[0].userId !== req.user!.userId) {
            res.status(404).json(ApiResponse.error({ message: 'Environment not found' }));
            return;
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

// Set active environment
router.patch('/:documentationId/environments/set-active', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { documentationId } = req.params;
        const schema = z.object({
            environmentId: z.string().uuid().nullable()
        });

        const input = schema.parse(req.body);

        const { rows: docs } = await query(
            'SELECT "userId" FROM documentation WHERE id = $1',
            [documentationId]
        );

        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        await query('BEGIN');

        try {
            await query(
                'UPDATE environments SET "isActive" = false WHERE "documentationId" = $1',
                [documentationId]
            );

            if (input.environmentId) {
                await query(
                    'UPDATE environments SET "isActive" = true WHERE id = $1 AND "documentationId" = $2',
                    [input.environmentId, documentationId]
                );
            }

            await query('COMMIT');

            const { rows: environments } = await query(
                'SELECT * FROM environments WHERE "documentationId" = $1 ORDER BY "order" ASC',
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

export default router;
