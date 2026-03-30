import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { adminMiddleware } from '../middleware/adminAuth';
import { catchAsync } from '../utils/catchAsync';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'ErrorLogService';
const router = Router();

// All routes require admin
router.use(authMiddleware as any);
router.use(adminMiddleware as any);

// ─── List error logs (paginated + filtered) ─────────────────────────

const listSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
    level: z.enum(['error', 'warn', 'critical']).optional(),
    service: z.string().optional(),
    errorCode: z.string().optional(),
    search: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
});

router.get('/', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const filters = listSchema.parse(req.query);
        const { page, limit } = filters;
        const offset = (page - 1) * limit;

        const conditions: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (filters.level) {
            conditions.push(`level = $${idx}`); values.push(filters.level); idx++;
        }
        if (filters.service) {
            conditions.push(`service = $${idx}`); values.push(filters.service); idx++;
        }
        if (filters.errorCode) {
            conditions.push(`error_code = $${idx}`); values.push(filters.errorCode); idx++;
        }
        if (filters.search) {
            conditions.push(`(message ILIKE $${idx} OR path ILIKE $${idx})`); values.push(`%${filters.search}%`); idx++;
        }
        if (filters.dateFrom) {
            conditions.push(`timestamp >= $${idx}`); values.push(filters.dateFrom); idx++;
        }
        if (filters.dateTo) {
            conditions.push(`timestamp <= $${idx}`); values.push(filters.dateTo); idx++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const [logsResult, countResult] = await Promise.all([
            query(
                `SELECT id, timestamp, level, service, function, error_code, message,
                        request_id, user_id, method, path, status_code, response_time, ip_address
                 FROM error_logs ${whereClause}
                 ORDER BY timestamp DESC
                 LIMIT $${idx} OFFSET $${idx + 1}`,
                [...values, limit, offset]
            ),
            query(`SELECT COUNT(*) FROM error_logs ${whereClause}`, values),
        ]);

        res.json(ApiResponse.success({
            message: 'Error logs fetched',
            data: {
                logs: logsResult.rows,
                total: parseInt(countResult.rows[0].count),
                page,
                limit,
                totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
            },
        }));
    } catch (error: any) {
        logErrorReport('listErrorLogs', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch error logs' }));
    }
}));

// ─── Get single error log (full detail) ─────────────────────────────

router.get('/:id', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query('SELECT * FROM error_logs WHERE id = $1', [req.params.id]);
        if (rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Error log not found' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Error log fetched', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('getErrorLog', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch error log' }));
    }
}));

// ─── Stats / aggregates ─────────────────────────────────────────────

router.get('/stats/summary', catchAsync(async (_req: AuthRequest, res: Response) => {
    try {
        const [
            totalResult,
            byLevelResult,
            byServiceResult,
            topCodesResult,
            recentTrendResult,
        ] = await Promise.all([
            // Total errors (last 24h, 7d, 30d)
            query(`SELECT
                COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '24 hours') AS last_24h,
                COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '7 days') AS last_7d,
                COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '30 days') AS last_30d,
                COUNT(*) AS total
            FROM error_logs`),

            // By level
            query(`SELECT level, COUNT(*) AS count FROM error_logs
                   WHERE timestamp > NOW() - INTERVAL '7 days'
                   GROUP BY level ORDER BY count DESC`),

            // By service
            query(`SELECT service, COUNT(*) AS count FROM error_logs
                   WHERE timestamp > NOW() - INTERVAL '7 days'
                   GROUP BY service ORDER BY count DESC LIMIT 10`),

            // Top error codes
            query(`SELECT error_code, COUNT(*) AS count, MAX(message) AS sample_message
                   FROM error_logs
                   WHERE timestamp > NOW() - INTERVAL '7 days' AND error_code IS NOT NULL
                   GROUP BY error_code ORDER BY count DESC LIMIT 10`),

            // Hourly trend (last 24h)
            query(`SELECT
                date_trunc('hour', timestamp) AS hour,
                COUNT(*) AS count
            FROM error_logs
            WHERE timestamp > NOW() - INTERVAL '24 hours'
            GROUP BY hour ORDER BY hour`),
        ]);

        res.json(ApiResponse.success({
            message: 'Error stats fetched',
            data: {
                totals: totalResult.rows[0],
                byLevel: byLevelResult.rows,
                byService: byServiceResult.rows,
                topCodes: topCodesResult.rows,
                hourlyTrend: recentTrendResult.rows,
            },
        }));
    } catch (error: any) {
        logErrorReport('getErrorStats', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch error stats' }));
    }
}));

// ─── Delete old logs ────────────────────────────────────────────────

router.delete('/cleanup', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const days = parseInt(req.query.days as string) || 90;
        const result = await query(
            `DELETE FROM error_logs WHERE timestamp < NOW() - INTERVAL '1 day' * $1 RETURNING id`,
            [days]
        );
        res.json(ApiResponse.success({
            message: `Cleaned up ${result.rows.length} error logs older than ${days} days`,
        }));
    } catch (error: any) {
        logErrorReport('cleanupErrorLogs', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to clean up error logs' }));
    }
}));

export default router;
