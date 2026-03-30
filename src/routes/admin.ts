import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/adminAuth';
import { query } from '../utils/db';
import { z } from 'zod';
import { ApiResponse } from '../utils/response';
import { logErrorReport, addLogListener, removeLogListener, LogEntry } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';
import { catchAsync } from '../utils/catchAsync';
import { getAllFlags } from '../utils/featureFlags';
import { sendBrandedEmail } from '../utils/email';
import crypto from 'crypto';

const SERVICE_NAME = 'AdminService';
const router = Router();

// Presence / Real-time Logs SSE
router.get('/logs/stream', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const listener = (log: LogEntry) => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
    };

    addLogListener(listener);

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
        removeLogListener(listener);
        res.end();
    });
});

// Apply auth and admin middleware to all other routes
router.use(authMiddleware);
router.use(adminMiddleware);

// List all email templates
router.get('/templates', catchAsync(async (_req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query('SELECT * FROM email_templates ORDER BY "createdAt" DESC LIMIT 100');
        res.json(ApiResponse.success({ message: 'Templates fetched', data: rows }));
    } catch (error: any) {
        logErrorReport('listTemplates', SERVICE_NAME, error, ERROR_CODES.ADMIN_TEMPLATE_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch templates' }));
    }
}));

// Get a single template
router.get('/templates/:id', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
        if (rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Template not found' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Template fetched', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('getTemplate', SERVICE_NAME, error, ERROR_CODES.ADMIN_TEMPLATE_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch template' }));
    }
}));

// Create a new template
router.post('/templates', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            name: z.string(),
            subject: z.string(),
            body: z.string(),
            variables: z.array(z.string()).default([]),
            isActive: z.boolean().default(true),
            isDefault: z.boolean().default(false),
            purpose: z.string()
        });

        const data = schema.parse(req.body);

        if (data.isDefault) {
            // Unset other defaults for the same purpose
            await query('UPDATE email_templates SET "isDefault" = FALSE WHERE purpose = $1', [data.purpose]);
        }

        const { rows } = await query(
            `INSERT INTO email_templates (name, subject, body, variables, "isActive", "isDefault", purpose) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [data.name, data.subject, data.body, JSON.stringify(data.variables), data.isActive, data.isDefault, data.purpose]
        );

        res.json(ApiResponse.success({ message: 'Template created', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('createTemplate', SERVICE_NAME, error, ERROR_CODES.ADMIN_TEMPLATE_CREATE_FAILED);
        res.status(error instanceof z.ZodError ? 400 : 500).json(ApiResponse.error({ message: error.message || 'Failed to create template' }));
    }
}));

// Update a template
router.patch('/templates/:id', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            name: z.string().optional(),
            subject: z.string().optional(),
            body: z.string().optional(),
            variables: z.array(z.string()).optional(),
            isActive: z.boolean().optional(),
            isDefault: z.boolean().optional(),
            purpose: z.string().optional()
        });

        const data = schema.parse(req.body);
        const { id } = req.params;

        if (data.isDefault === true) {
            // If setting this as default, we need to know the purpose first
            const { rows: current } = await query('SELECT purpose FROM email_templates WHERE id = $1', [id]);
            if (current.length > 0) {
                await query('UPDATE email_templates SET "isDefault" = FALSE WHERE purpose = $1', [current[0].purpose]);
            }
        }

        // Build dynamic update query
        const fields = Object.keys(data).filter(key => (data as any)[key] !== undefined);
        if (fields.length === 0) {
            res.status(400).json(ApiResponse.error({ message: 'No fields to update' }));
            return;
        }

        const values = fields.map(key => {
            const val = (data as any)[key];
            return key === 'variables' ? JSON.stringify(val) : val;
        });
        const setClause = fields.map((key, i) => `"${key}" = $${i + 2}`).join(', ');

        const { rows } = await query(
            `UPDATE email_templates SET ${setClause}, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [id, ...values]
        );

        if (rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Template not found' }));
            return;
        }

        res.json(ApiResponse.success({ message: 'Template updated', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('updateTemplate', SERVICE_NAME, error, ERROR_CODES.ADMIN_TEMPLATE_UPDATE_FAILED);
        res.status(error instanceof z.ZodError ? 400 : 500).json(ApiResponse.error({ message: error.message || 'Failed to update template' }));
    }
}));

// Delete a template
router.delete('/templates/:id', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        await query('DELETE FROM email_templates WHERE id = $1', [req.params.id]);
        res.json(ApiResponse.success({ message: 'Template deleted' }));
    } catch (error: any) {
        logErrorReport('deleteTemplate', SERVICE_NAME, error, ERROR_CODES.ADMIN_TEMPLATE_DELETE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete template' }));
    }
}));

// List email logs (for analytics)
router.get('/logs', catchAsync(async (_req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query(`
            SELECT l.*, t.name as "templateName", d.title as "documentationTitle"
            FROM email_logs l
            LEFT JOIN email_templates t ON l."templateId" = t.id
            LEFT JOIN documentation d ON l."documentationId" = d.id
            ORDER BY l."sentAt" DESC
            LIMIT 100
        `);
        res.json(ApiResponse.success({ message: 'Logs fetched', data: rows }));
    } catch (error: any) {
        logErrorReport('listLogs', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch logs' }));
    }
}));

// ═══════════════════════════════════════════════════════════════════
// A. Overview Dashboard Stats
// ═══════════════════════════════════════════════════════════════════

router.get('/overview/stats', catchAsync(async (_req: AuthRequest, res: Response) => {
    try {
        const [users, collections, requests, monitors, recentUsers, recentErrors] = await Promise.all([
            query('SELECT COUNT(*) FROM users'),
            query('SELECT COUNT(*) FROM documentation'),
            query('SELECT COUNT(*) FROM requests'),
            query(`SELECT COUNT(*) FROM monitors WHERE "isActive" = true`),
            query(`SELECT id, email, name, is_admin, email_verified, "createdAt"
                   FROM users ORDER BY "createdAt" DESC LIMIT 10`),
            query(`SELECT id, timestamp, level, service, error_code, message
                   FROM error_logs ORDER BY timestamp DESC LIMIT 10`),
        ]);

        res.json(ApiResponse.success({
            message: 'Overview stats fetched',
            data: {
                totalUsers: parseInt(users.rows[0].count),
                totalCollections: parseInt(collections.rows[0].count),
                totalRequests: parseInt(requests.rows[0].count),
                activeMonitors: parseInt(monitors.rows[0].count),
                recentUsers: recentUsers.rows,
                recentErrors: recentErrors.rows,
            },
        }));
    } catch (error: any) {
        logErrorReport('overviewStats', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch overview stats' }));
    }
}));

router.get('/overview/charts', catchAsync(async (_req: AuthRequest, res: Response) => {
    try {
        const [usersPerWeek, requestsPerWeek] = await Promise.all([
            query(`SELECT date_trunc('week', "createdAt") AS week, COUNT(*) AS count
                   FROM users WHERE "createdAt" > NOW() - INTERVAL '30 days'
                   GROUP BY week ORDER BY week`),
            query(`SELECT date_trunc('week', "createdAt") AS week, COUNT(*) AS count
                   FROM requests WHERE "createdAt" > NOW() - INTERVAL '30 days'
                   GROUP BY week ORDER BY week`),
        ]);

        res.json(ApiResponse.success({
            message: 'Chart data fetched',
            data: {
                usersPerWeek: usersPerWeek.rows,
                requestsPerWeek: requestsPerWeek.rows,
            },
        }));
    } catch (error: any) {
        logErrorReport('overviewCharts', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch chart data' }));
    }
}));

// ═══════════════════════════════════════════════════════════════════
// B. User Management
// ═══════════════════════════════════════════════════════════════════

router.get('/users', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
        const offset = (page - 1) * limit;
        const search = req.query.search as string;
        const role = req.query.role as string; // 'admin' | 'user'
        const verified = req.query.verified as string; // 'true' | 'false'

        const conditions: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (search) {
            conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx})`);
            values.push(`%${search}%`);
            idx++;
        }
        if (role === 'admin') { conditions.push(`is_admin = true`); }
        else if (role === 'user') { conditions.push(`is_admin = false`); }
        if (verified === 'true') { conditions.push(`email_verified = true`); }
        else if (verified === 'false') { conditions.push(`email_verified = false`); }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const [usersResult, countResult] = await Promise.all([
            query(
                `SELECT id, email, name, avatar_url, is_admin, email_verified, settings, "createdAt", "updatedAt"
                 FROM users ${where}
                 ORDER BY "createdAt" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
                [...values, limit, offset]
            ),
            query(`SELECT COUNT(*) FROM users ${where}`, values),
        ]);

        res.json(ApiResponse.success({
            message: 'Users fetched',
            data: {
                users: usersResult.rows,
                total: parseInt(countResult.rows[0].count),
                page, limit,
                totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
            },
        }));
    } catch (error: any) {
        logErrorReport('listUsers', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch users' }));
    }
}));

router.patch('/users/:id', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            is_admin: z.boolean().optional(),
            email_verified: z.boolean().optional(),
        });
        const data = schema.parse(req.body);
        const { id } = req.params;

        // Prevent self-demotion
        if (id === req.user!.userId && data.is_admin === false) {
            res.status(400).json(ApiResponse.error({ message: 'Cannot remove your own admin role' }));
            return;
        }

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (data.is_admin !== undefined) { fields.push(`is_admin = $${idx}`); values.push(data.is_admin); idx++; }
        if (data.email_verified !== undefined) { fields.push(`email_verified = $${idx}`); values.push(data.email_verified); idx++; }

        if (fields.length === 0) { res.status(400).json(ApiResponse.error({ message: 'No fields to update' })); return; }

        values.push(id);
        const { rows } = await query(
            `UPDATE users SET ${fields.join(', ')}, "updatedAt" = NOW() WHERE id = $${idx} RETURNING id, email, name, is_admin, email_verified`,
            values
        );

        if (rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'User not found' })); return; }
        res.json(ApiResponse.success({ message: 'User updated', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('updateUser', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update user' }));
    }
}));

router.delete('/users/:id', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        if (id === req.user!.userId) {
            res.status(400).json(ApiResponse.error({ message: 'Cannot delete your own account' }));
            return;
        }
        const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'User not found' })); return; }
        res.json(ApiResponse.success({ message: 'User deleted' }));
    } catch (error: any) {
        logErrorReport('deleteUser', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete user' }));
    }
}));

router.post('/users/:id/reset-password', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query('SELECT id, email FROM users WHERE id = $1', [req.params.id]);
        if (rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'User not found' })); return; }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600 * 1000);

        await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [rows[0].id]);
        await query('INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, rows[0].id, expiresAt]);

        const clientUrl = process.env.ALLOWED_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:3000';
        const resetLink = `${clientUrl}/reset-password?token=${token}`;

        await sendBrandedEmail(rows[0].email, 'PASSWORD_RESET', { resetLink, expiresIn: '1 hour' });
        res.json(ApiResponse.success({ message: `Password reset email sent to ${rows[0].email}` }));
    } catch (error: any) {
        logErrorReport('adminResetPassword', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to send password reset' }));
    }
}));

// ═══════════════════════════════════════════════════════════════════
// C. Settings
// ═══════════════════════════════════════════════════════════════════

router.get('/settings/feature-flags', catchAsync(async (_req: AuthRequest, res: Response) => {
    res.json(ApiResponse.success({ message: 'Feature flags fetched', data: getAllFlags() }));
}));

router.get('/settings/smtp-status', catchAsync(async (_req: AuthRequest, res: Response) => {
    res.json(ApiResponse.success({
        message: 'SMTP status',
        data: {
            configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
            host: process.env.SMTP_HOST ? process.env.SMTP_HOST.replace(/\..+/, '.*') : null,
        },
    }));
}));

router.get('/settings/migrations', catchAsync(async (_req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query(`SELECT COUNT(*) as total FROM migration_tracking WHERE applied = true`);
        const { rows: pending } = await query(`SELECT COUNT(*) as total FROM migration_tracking WHERE applied = false`);
        res.json(ApiResponse.success({
            message: 'Migration status',
            data: {
                applied: parseInt(rows[0]?.total || '0'),
                pending: parseInt(pending[0]?.total || '0'),
            },
        }));
    } catch {
        // migration_tracking might not exist
        res.json(ApiResponse.success({ message: 'Migration status', data: { applied: 'unknown', pending: 'unknown' } }));
    }
}));

router.post('/settings/clear-sessions', catchAsync(async (_req: AuthRequest, res: Response) => {
    try {
        const result = await query('DELETE FROM refresh_tokens RETURNING id');
        res.json(ApiResponse.success({ message: `Cleared ${result.rows.length} sessions` }));
    } catch (error: any) {
        logErrorReport('clearSessions', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to clear sessions' }));
    }
}));

export default router;
