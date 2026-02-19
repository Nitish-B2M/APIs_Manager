import express, { Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { query } from '../utils/db';
import { z } from 'zod';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'TodoService';
const router = express.Router();

// Validation schemas
const createTodoSchema = z.object({
    title: z.string().min(1),
    main_title: z.string().optional(),
    date: z.string().optional(),
    is_completed: z.boolean().optional(),
    position: z.number().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    description: z.string().max(500).optional()
});

const updateTodoSchema = z.object({
    title: z.string().min(1).optional(),
    main_title: z.string().optional(),
    date: z.string().optional(),
    is_completed: z.boolean().optional(),
    position: z.number().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    description: z.string().max(500).optional()
});

const reorderSchema = z.object({
    orders: z.array(z.object({
        id: z.string().uuid(),
        position: z.number()
    }))
});

// GET all todos for a user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const result = await query(
            'SELECT * FROM todos WHERE "userId" = $1 AND "deletedAt" IS NULL ORDER BY date DESC, position ASC LIMIT 50',
            [userId]
        );
        res.json(ApiResponse.success({
            message: 'Todos fetched successfully',
            data: result.rows,
        }));
    } catch (error) {
        logErrorReport('getTodos', SERVICE_NAME, error, ERROR_CODES.TODO_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch todos' }));
    }
});

// CREATE a new todo
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { title, main_title, date, is_completed, position, priority, description } = createTodoSchema.parse(req.body);

        const result = await query(
            `INSERT INTO todos ("userId", title, main_title, date, is_completed, position, priority, description) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             RETURNING *`,
            [userId, title, main_title || 'General', date ? new Date(date) : new Date(), is_completed || false, position || 0, priority || 'medium', description || null]
        );

        res.status(201).json(ApiResponse.success({
            message: 'Todo created successfully',
            data: result.rows[0],
        }));
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json(ApiResponse.error({ message: 'Validation failed' }));
            return;
        }
        logErrorReport('createTodo', SERVICE_NAME, error, ERROR_CODES.TODO_CREATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to create todo' }));
    }
});

// UPDATE a todo
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const todoId = req.params.id;
        const updates = updateTodoSchema.parse(req.body);

        const check = await query(
            'SELECT * FROM todos WHERE id = $1 AND "userId" = $2 AND "deletedAt" IS NULL',
            [todoId, userId]
        );

        if (check.rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Todo not found' }));
            return;
        }

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
                fields.push(`"${key}" = $${idx}`);
                values.push(key === 'date' ? new Date(value as string) : value);
                idx++;
            }
        });

        if (fields.length === 0) {
            res.json(ApiResponse.success({
                message: 'No changes made',
                data: check.rows[0],
            }));
            return;
        }

        fields.push(`"updatedAt" = CURRENT_TIMESTAMP`);
        values.push(todoId);
        values.push(userId);

        const queryText = `
            UPDATE todos 
            SET ${fields.join(', ')} 
            WHERE id = $${idx} AND "userId" = $${idx + 1}
            RETURNING *
        `;

        const result = await query(queryText, values);
        res.json(ApiResponse.success({
            message: 'Todo updated successfully',
            data: result.rows[0],
        }));
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json(ApiResponse.error({ message: 'Validation failed' }));
            return;
        }
        logErrorReport('updateTodo', SERVICE_NAME, error, ERROR_CODES.TODO_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update todo' }));
    }
});

// DELETE a todo
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const todoId = req.params.id;

        const result = await query(
            'UPDATE todos SET "deletedAt" = CURRENT_TIMESTAMP WHERE id = $1 AND "userId" = $2 RETURNING id',
            [todoId, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Todo not found' }));
            return;
        }

        res.json(ApiResponse.success({ message: 'Todo deleted successfully' }));
    } catch (error) {
        logErrorReport('deleteTodo', SERVICE_NAME, error, ERROR_CODES.TODO_DELETE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete todo' }));
    }
});

// Reorder todos (Batch update)
router.put('/reorder/batch', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { orders } = reorderSchema.parse(req.body);

        await query('BEGIN');

        try {
            for (const item of orders) {
                await query(
                    'UPDATE todos SET position = $1 WHERE id = $2 AND "userId" = $3 AND "deletedAt" IS NULL',
                    [item.position, item.id, userId]
                );
            }
            await query('COMMIT');
            res.json(ApiResponse.success({ message: 'Todos reordered successfully' }));
        } catch (dbError) {
            await query('ROLLBACK');
            throw dbError;
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json(ApiResponse.error({ message: 'Validation failed' }));
            return;
        }
        logErrorReport('reorderTodos', SERVICE_NAME, error, ERROR_CODES.TODO_REORDER_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to reorder todos' }));
    }
});

// GET trash (soft-deleted todos)
router.get('/trash/list', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const result = await query(
            'SELECT * FROM todos WHERE "userId" = $1 AND "deletedAt" IS NOT NULL ORDER BY "deletedAt" DESC LIMIT 50',
            [userId]
        );
        res.json(ApiResponse.success({
            message: 'Trash fetched successfully',
            data: result.rows,
        }));
    } catch (error) {
        logErrorReport('getTodoTrash', SERVICE_NAME, error, ERROR_CODES.TODO_TRASH_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch trash' }));
    }
});

// RESTORE a deleted todo
router.patch('/:id/restore', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const todoId = req.params.id;

        const result = await query(
            'UPDATE todos SET "deletedAt" = NULL WHERE id = $1 AND "userId" = $2 AND "deletedAt" IS NOT NULL RETURNING *',
            [todoId, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Todo not found in trash' }));
            return;
        }

        res.json(ApiResponse.success({
            message: 'Todo restored successfully',
            data: result.rows[0],
        }));
    } catch (error) {
        logErrorReport('restoreTodo', SERVICE_NAME, error, ERROR_CODES.TODO_RESTORE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to restore todo' }));
    }
});

export default router;
