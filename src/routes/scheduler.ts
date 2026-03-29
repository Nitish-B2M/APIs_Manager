import { Router, Response } from 'express';
import { query } from '../utils/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { ApiResponse } from '../utils/response';
import { z } from 'zod';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';

const router = Router();

// ─── Zod Schemas ─────────────────────────────────────────────────────

const createTaskSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    priority: z.number().min(1).max(5).default(3),
    duration_minutes: z.number().min(1).max(480).default(30),
    deadline: z.string().optional().nullable(),
    is_flexible: z.boolean().default(true),
    scheduled_start: z.string().optional().nullable(),
    scheduled_end: z.string().optional().nullable(),
});

const updateTaskSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    priority: z.number().min(1).max(5).optional(),
    duration_minutes: z.number().min(1).max(480).optional(),
    deadline: z.string().optional().nullable(),
    is_flexible: z.boolean().optional(),
    status: z.enum(['pending', 'completed', 'deleted']).optional(),
    scheduled_start: z.string().optional().nullable(),
    scheduled_end: z.string().optional().nullable(),
});

const createHabitSchema = z.object({
    title: z.string().min(1).max(200),
    frequency: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
    duration_minutes: z.number().min(1).max(480).default(30),
    preferred_window: z.string().default('morning'),
    priority: z.number().min(1).max(5).default(3),
});

// ─── Tasks CRUD ──────────────────────────────────────────────────────

router.get('/tasks', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const pg = parsePagination(req, { limit: 50, sortBy: 'created_at' });

    const countResult = await query(
        "SELECT COUNT(*) FROM scheduler_tasks WHERE user_id = $1 AND status != 'deleted'",
        [req.user!.userId]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await query(
        "SELECT * FROM scheduler_tasks WHERE user_id = $1 AND status != 'deleted' ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        [req.user!.userId, pg.limit, pg.offset]
    );
    res.json(ApiResponse.success({ message: 'Tasks fetched', data: result.rows, pagination: buildPaginationMeta(total, pg) }));
}));

router.post('/tasks', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const data = createTaskSchema.parse(req.body);
    const result = await query(
        `INSERT INTO scheduler_tasks (user_id, title, description, priority, duration_minutes, deadline, is_flexible, scheduled_start, scheduled_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [req.user!.userId, data.title, data.description, data.priority, data.duration_minutes, data.deadline, data.is_flexible, data.scheduled_start, data.scheduled_end]
    );
    res.json(ApiResponse.success({ message: 'Task created', data: result.rows[0] }));
}));

router.patch('/tasks/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const updates = updateTaskSchema.parse(req.body);

    const allowedFields = ['title', 'description', 'priority', 'duration_minutes', 'deadline', 'is_flexible', 'status', 'scheduled_start', 'scheduled_end'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key) && (updates as any)[key] !== undefined);

    if (fields.length === 0) {
        res.status(400).json(ApiResponse.error({ message: 'No valid fields provided' }));
        return;
    }

    const values = [id, ...fields.map(field => (updates as any)[field]), req.user!.userId];
    const setString = fields.map((field, i) => `"${field}" = $${i + 2}`).join(', ');

    const result = await query(
        `UPDATE scheduler_tasks SET ${setString} WHERE id = $1 AND user_id = $${fields.length + 2} RETURNING *`,
        values
    );

    if (result.rows.length === 0) {
        res.status(404).json(ApiResponse.error({ message: 'Task not found' }));
        return;
    }
    res.json(ApiResponse.success({ message: 'Task updated', data: result.rows[0] }));
}));

router.delete('/tasks/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const result = await query(
        "UPDATE scheduler_tasks SET status = 'deleted' WHERE id = $1 AND user_id = $2 RETURNING *",
        [req.params.id, req.user!.userId]
    );
    if (result.rows.length === 0) {
        res.status(404).json(ApiResponse.error({ message: 'Task not found' }));
        return;
    }
    res.json(ApiResponse.success({ message: 'Task deleted' }));
}));

// ─── Habits CRUD ─────────────────────────────────────────────────────

router.get('/habits', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const pg = parsePagination(req, { limit: 50, sortBy: 'created_at' });

    const countResult = await query('SELECT COUNT(*) FROM scheduler_habits WHERE user_id = $1', [req.user!.userId]);
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await query(
        'SELECT * FROM scheduler_habits WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [req.user!.userId, pg.limit, pg.offset]
    );
    res.json(ApiResponse.success({ message: 'Habits fetched', data: result.rows, pagination: buildPaginationMeta(total, pg) }));
}));

router.post('/habits', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const data = createHabitSchema.parse(req.body);
    const result = await query(
        `INSERT INTO scheduler_habits (user_id, title, frequency, duration_minutes, preferred_window, priority)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.user!.userId, data.title, data.frequency, data.duration_minutes, data.preferred_window, data.priority]
    );
    res.json(ApiResponse.success({ message: 'Habit created', data: result.rows[0] }));
}));

// ─── Events & Settings ───────────────────────────────────────────────

router.get('/events', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const { start, end } = req.query;
    const [eventsResult, tasksResult] = await Promise.all([
        query(
            `SELECT * FROM scheduler_events WHERE user_id = $1 AND start_time >= $2 AND end_time <= $3`,
            [req.user!.userId, start || '1970-01-01', end || '2100-01-01']
        ),
        query(
            `SELECT id, title, scheduled_start as start_time, scheduled_end as end_time, priority, description, 'task' as source
             FROM scheduler_tasks WHERE user_id = $1 AND scheduled_start IS NOT NULL AND status != 'deleted'
             AND scheduled_start >= $2 AND scheduled_start <= $3`,
            [req.user!.userId, start || '1970-01-01', end || '2100-01-01']
        )
    ]);

    const combined = [
        ...eventsResult.rows,
        ...tasksResult.rows.map(t => ({
            id: t.id, title: t.title, start_time: t.start_time, end_time: t.end_time,
            source: 'task', metadata: { priority: t.priority, description: t.description }
        }))
    ];

    res.json(ApiResponse.success({ message: 'Events fetched', data: combined }));
}));

router.get('/settings', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const result = await query('SELECT * FROM scheduler_settings WHERE user_id = $1', [req.user!.userId]);
    if (result.rows.length === 0) {
        const initSettings = await query('INSERT INTO scheduler_settings (user_id) VALUES ($1) RETURNING *', [req.user!.userId]);
        res.json(ApiResponse.success({ message: 'Settings initialized', data: initSettings.rows[0] }));
        return;
    }
    res.json(ApiResponse.success({ message: 'Settings fetched', data: result.rows[0] }));
}));

router.post('/optimize', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const now = new Date();
    const startSearch = new Date(now.getTime() + 60 * 60 * 1000);
    const endSearch = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [tasksResult, busySlotsResult] = await Promise.all([
        query("SELECT * FROM scheduler_tasks WHERE user_id = $1 AND scheduled_start IS NULL AND status != 'deleted' ORDER BY priority ASC, created_at ASC", [userId]),
        query(
            `SELECT start_time as start, end_time as "end" FROM scheduler_events WHERE user_id = $1 AND end_time > $2
             UNION ALL
             SELECT scheduled_start as start, scheduled_end as "end" FROM scheduler_tasks WHERE user_id = $1 AND scheduled_start > $2 AND status != 'deleted'
             ORDER BY start ASC`,
            [userId, now.toISOString()]
        )
    ]);

    const unscheduledTasks = tasksResult.rows;
    const busySlots = busySlotsResult.rows.map(slot => ({ start: new Date(slot.start), end: new Date(slot.end) }));
    let currentTime = new Date(startSearch);

    const findNextGap = (durationMinutes: number) => {
        while (currentTime < endSearch) {
            const hour = currentTime.getHours();
            if (hour < 8) { currentTime.setHours(8, 0, 0, 0); continue; }
            if (hour >= 21) { currentTime.setDate(currentTime.getDate() + 1); currentTime.setHours(8, 0, 0, 0); continue; }
            const potentialEnd = new Date(currentTime.getTime() + durationMinutes * 60000);
            const overlap = busySlots.find(slot =>
                (currentTime >= slot.start && currentTime < slot.end) ||
                (potentialEnd > slot.start && potentialEnd <= slot.end) ||
                (currentTime <= slot.start && potentialEnd >= slot.end)
            );
            if (!overlap) return { start: new Date(currentTime), end: potentialEnd };
            currentTime = new Date(overlap.end.getTime() + 5 * 60000);
        }
        return null;
    };

    const updates = [];
    for (const task of unscheduledTasks) {
        const gap = findNextGap(task.duration_minutes || 30);
        if (gap) {
            updates.push(query('UPDATE scheduler_tasks SET scheduled_start = $1, scheduled_end = $2 WHERE id = $3', [gap.start.toISOString(), gap.end.toISOString(), task.id]));
            currentTime = new Date(gap.end.getTime() + 10 * 60000);
        }
    }

    await Promise.all(updates);
    res.json(ApiResponse.success({ message: `Optimization complete. ${updates.length} tasks scheduled.`, data: { scheduledCount: updates.length } }));
}));

export default router;
