import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'SearchService';
const router = Router();

// ─── Global search across all entities ───────────────────────────────

const searchSchema = z.object({
    q: z.string().min(1).max(200),
    type: z.enum(['all', 'collection', 'request', 'note']).default('all'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', '']).optional(),
    limit: z.coerce.number().min(1).max(50).default(20),
});

router.get('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = searchSchema.parse(req.query);
        const userId = req.user!.userId;
        const tsQuery = data.q.split(/\s+/).filter(Boolean).join(' & ');
        const results: any = {};

        // Search collections
        if (data.type === 'all' || data.type === 'collection') {
            const { rows } = await query(
                `SELECT id, title, "isPublic", "updatedAt", 'collection' as "entityType"
                 FROM documentation
                 WHERE ("userId" = $1 OR id IN (SELECT "documentationId" FROM documentation_collaborators WHERE "userId" = $1))
                 AND to_tsvector('english', COALESCE(title, '')) @@ to_tsquery('english', $2)
                 ORDER BY "updatedAt" DESC LIMIT $3`,
                [userId, tsQuery, data.limit]
            );
            results.collections = rows;
        }

        // Search requests
        if (data.type === 'all' || data.type === 'request') {
            let reqSql = `
                SELECT r.id, r.name, r.method, r.url, r."documentationId", r."updatedAt", 'request' as "entityType"
                FROM requests r
                JOIN documentation d ON r."documentationId" = d.id
                WHERE (d."userId" = $1 OR d.id IN (SELECT "documentationId" FROM documentation_collaborators WHERE "userId" = $1))
                AND to_tsvector('english', COALESCE(r.name, '') || ' ' || COALESCE(r.url, '') || ' ' || COALESCE(r.description, '')) @@ to_tsquery('english', $2)
            `;
            const params: any[] = [userId, tsQuery];

            if (data.method) { params.push(data.method); reqSql += ` AND r.method = $${params.length}`; }
            params.push(data.limit);
            reqSql += ` ORDER BY r."updatedAt" DESC LIMIT $${params.length}`;

            const { rows } = await query(reqSql, params);
            results.requests = rows;
        }

        // Search notes
        if (data.type === 'all' || data.type === 'note') {
            const { rows } = await query(
                `SELECT id, title, "updatedAt", 'note' as "entityType"
                 FROM notes
                 WHERE "userId" = $1 AND is_deleted = false
                 AND title ILIKE $2
                 ORDER BY "updatedAt" DESC LIMIT $3`,
                [userId, `%${data.q}%`, data.limit]
            );
            results.notes = rows;
        }

        res.json(ApiResponse.success({ message: 'Search results', data: results }));
    } catch (error) {
        logErrorReport('globalSearch', SERVICE_NAME, error, ERROR_CODES.SEARCH_QUERY_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to perform search' }));
    }
}));

export default router;
