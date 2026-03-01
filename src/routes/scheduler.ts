import { Router, Response } from 'express';
import { query } from '../utils/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// 1. Tasks CRUD
router.get('/tasks', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const result = await query(
            "SELECT * FROM scheduler_tasks WHERE user_id = $1 AND status != 'deleted' ORDER BY created_at DESC",
            [req.user!.userId]
        );
        res.json({ status: true, data: result.rows });
    } catch (error: any) {
        res.status(500).json({ status: false, message: error.message });
    }
});

router.post('/tasks', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { title, description, priority, duration_minutes, deadline, is_flexible, scheduled_start, scheduled_end } = req.body;
    try {
        const result = await query(
            `INSERT INTO scheduler_tasks (user_id, title, description, priority, duration_minutes, deadline, is_flexible, scheduled_start, scheduled_end)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [req.user!.userId, title, description, priority || 3, duration_minutes || 30, deadline, is_flexible ?? true, scheduled_start, scheduled_end]
        );
        res.json({ status: true, data: result.rows[0], message: 'Task created successfully' });
    } catch (error: any) {
        res.status(500).json({ status: false, message: error.message });
    }
});

router.patch('/tasks/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const updates = req.body;

    const fields = Object.keys(updates).filter(key =>
        ['title', 'description', 'priority', 'duration_minutes', 'deadline', 'is_flexible', 'status', 'scheduled_start', 'scheduled_end'].includes(key)
    );

    if (fields.length === 0) {
        res.status(400).json({ status: false, message: 'No valid fields provided' });
        return;
    }

    const values = [id, ...fields.map(field => updates[field]), req.user!.userId];
    const setString = fields.map((field, i) => `"${field}" = $${i + 2}`).join(', ');

    try {
        const result = await query(
            `UPDATE scheduler_tasks SET ${setString} WHERE id = $1 AND user_id = $${fields.length + 2} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            res.status(404).json({ status: false, message: 'Task not found' });
            return;
        }
        res.json({ status: true, data: result.rows[0], message: 'Task updated successfully' });
    } catch (error: any) {
        res.status(500).json({ status: false, message: error.message });
    }
});

router.delete('/tasks/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const result = await query(
            "UPDATE scheduler_tasks SET status = 'deleted' WHERE id = $1 AND user_id = $2 RETURNING *",
            [req.params.id, req.user!.userId]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ status: false, message: 'Task not found' });
            return;
        }
        res.json({ status: true, message: 'Task deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 2. Habits CRUD
router.get('/habits', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const result = await query(
            'SELECT * FROM scheduler_habits WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user!.userId]
        );
        res.json({ status: true, data: result.rows });
    } catch (error: any) {
        res.status(500).json({ status: false, message: error.message });
    }
});

router.post('/habits', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { title, frequency, duration_minutes, preferred_window, priority } = req.body;
    try {
        const result = await query(
            `INSERT INTO scheduler_habits (user_id, title, frequency, duration_minutes, preferred_window, priority)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [req.user!.userId, title, frequency || 'daily', duration_minutes || 30, preferred_window || 'morning', priority || 3]
        );
        res.json({ status: true, data: result.rows[0], message: 'Habit created successfully' });
    } catch (error: any) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 3. Events & Settings
router.get('/events', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { start, end } = req.query;
    try {
        // Fetch both explicit events and scheduled tasks
        const [eventsResult, tasksResult] = await Promise.all([
            query(
                `SELECT * FROM scheduler_events 
                 WHERE user_id = $1 
                 AND start_time >= $2 
                 AND end_time <= $3`,
                [req.user!.userId, start || '1970-01-01', end || '2100-01-01']
            ),
            query(
                `SELECT id, title, scheduled_start as start_time, scheduled_end as end_time, priority, description, 'task' as source
                 FROM scheduler_tasks
                 WHERE user_id = $1
                 AND scheduled_start IS NOT NULL
                 AND status != 'deleted'
                 AND scheduled_start >= $2
                 AND scheduled_start <= $3`,
                [req.user!.userId, start || '1970-01-01', end || '2100-01-01']
            )
        ]);

        // Combine them
        const combined = [
            ...eventsResult.rows,
            ...tasksResult.rows.map(t => ({
                id: t.id,
                title: t.title,
                start_time: t.start_time,
                end_time: t.end_time,
                source: 'task',
                metadata: { priority: t.priority, description: t.description }
            }))
        ];

        res.json({ status: true, data: combined });
    } catch (error: any) {
        res.status(500).json({ status: false, message: error.message });
    }
});

router.get('/settings', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const result = await query('SELECT * FROM scheduler_settings WHERE user_id = $1', [req.user!.userId]);
        if (result.rows.length === 0) {
            const initSettings = await query(
                'INSERT INTO scheduler_settings (user_id) VALUES ($1) RETURNING *',
                [req.user!.userId]
            );
            res.json({ status: true, data: initSettings.rows[0] });
            return;
        }
        res.json({ status: true, data: result.rows[0] });
    } catch (error: any) {
        res.status(500).json({ status: false, message: error.message });
    }
});

router.post('/optimize', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const now = new Date();
        const startSearch = new Date(now.getTime() + 60 * 60 * 1000); // Start searching from 1 hour from now
        const endSearch = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days window

        const [tasksResult, busySlotsResult] = await Promise.all([
            query(
                "SELECT * FROM scheduler_tasks WHERE user_id = $1 AND scheduled_start IS NULL AND status != 'deleted' ORDER BY priority ASC, created_at ASC",
                [userId]
            ),
            query(
                `SELECT start_time as start, end_time as "end" FROM scheduler_events WHERE user_id = $1 AND end_time > $2
                 UNION ALL
                 SELECT scheduled_start as start, scheduled_end as "end" FROM scheduler_tasks WHERE user_id = $1 AND scheduled_start > $2 AND status != 'deleted'
                 ORDER BY start ASC`,
                [userId, now.toISOString()]
            )
        ]);

        const unscheduledTasks = tasksResult.rows;
        const busySlots = busySlotsResult.rows.map(slot => ({
            start: new Date(slot.start),
            end: new Date(slot.end)
        }));

        let currentTime = new Date(startSearch);

        // Helper to find next gap
        const findNextGap = (durationMinutes: number) => {
            while (currentTime < endSearch) {
                // Constraint: Only schedule between 08:00 and 22:00
                const hour = currentTime.getHours();
                if (hour < 8) {
                    currentTime.setHours(8, 0, 0, 0);
                    continue;
                }
                if (hour >= 21) {
                    currentTime.setDate(currentTime.getDate() + 1);
                    currentTime.setHours(8, 0, 0, 0);
                    continue;
                }

                const potentialEnd = new Date(currentTime.getTime() + durationMinutes * 60000);

                // Check if this window overlaps with any busy slot
                const overlap = busySlots.find(slot =>
                    (currentTime >= slot.start && currentTime < slot.end) ||
                    (potentialEnd > slot.start && potentialEnd <= slot.end) ||
                    (currentTime <= slot.start && potentialEnd >= slot.end)
                );

                if (!overlap) {
                    return { start: new Date(currentTime), end: potentialEnd };
                }

                // If overlap, move currentTime to the end of the overlap
                currentTime = new Date(overlap.end.getTime() + 5 * 60000); // 5 min buffer
            }
            return null;
        };

        const updates = [];
        for (const task of unscheduledTasks) {
            const gap = findNextGap(task.duration_minutes || 30);
            if (gap) {
                updates.push(query(
                    'UPDATE scheduler_tasks SET scheduled_start = $1, scheduled_end = $2 WHERE id = $3',
                    [gap.start.toISOString(), gap.end.toISOString(), task.id]
                ));
                // Move current time forward
                currentTime = new Date(gap.end.getTime() + 10 * 60000); // 10 min buffer between tasks
            }
        }

        await Promise.all(updates);

        res.json({
            status: true,
            message: `Optimization complete. ${updates.length} tasks scheduled.`,
            data: { scheduledCount: updates.length }
        });
    } catch (error: any) {
        res.status(500).json({ status: false, message: error.message });
    }
});

export default router;
