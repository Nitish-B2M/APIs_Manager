import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'TemplateService';
const router = Router();

// List templates
router.get('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const category = req.query.category as string | undefined;
        let sql = 'SELECT * FROM request_templates WHERE ("userId" = $1 OR "workspaceId" IN (SELECT "workspaceId" FROM workspace_members WHERE "userId" = $1))';
        const params: any[] = [req.user!.userId];

        if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
        sql += ' ORDER BY "createdAt" DESC LIMIT 100';

        const { rows } = await query(sql, params);
        res.json(ApiResponse.success({ message: 'Templates fetched', data: rows }));
    } catch (error) {
        logErrorReport('listTemplates', SERVICE_NAME, error, ERROR_CODES.TEMPLATE_CRUD_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch templates' }));
    }
}));

// Create template
const createSchema = z.object({
    name: z.string().min(1).max(200),
    category: z.string().max(50).default('general'),
    method: z.string().default('GET'),
    url: z.string().optional(),
    headers: z.any().optional(),
    body: z.any().optional(),
    description: z.string().max(1000).optional(),
    workspaceId: z.string().uuid().optional(),
});

router.post('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = createSchema.parse(req.body);
        const { rows } = await query(
            `INSERT INTO request_templates ("userId", "workspaceId", name, category, method, url, headers, body, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user!.userId, data.workspaceId || null, data.name, data.category, data.method, data.url || null,
             data.headers ? JSON.stringify(data.headers) : '[]', data.body ? JSON.stringify(data.body) : null, data.description || null]
        );
        res.json(ApiResponse.success({ message: 'Template created', data: rows[0] }));
    } catch (error) {
        logErrorReport('createTemplate', SERVICE_NAME, error, ERROR_CODES.TEMPLATE_CRUD_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to create template' }));
    }
}));

// Create template from existing request
router.post('/from-request/:requestId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { rows: reqs } = await query('SELECT * FROM requests WHERE id = $1', [req.params.requestId]);
        if (reqs.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Request not found' })); return; }

        const r = reqs[0];
        const { rows } = await query(
            `INSERT INTO request_templates ("userId", name, category, method, url, headers, body, description)
             VALUES ($1, $2, 'saved', $3, $4, $5, $6, $7) RETURNING *`,
            [req.user!.userId, `Template: ${r.name}`, r.method, r.url, r.headers, r.body, r.description]
        );
        res.json(ApiResponse.success({ message: 'Template created from request', data: rows[0] }));
    } catch (error) {
        logErrorReport('createTemplateFromRequest', SERVICE_NAME, error, ERROR_CODES.TEMPLATE_CRUD_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to create template from request' }));
    }
}));

// Delete template
router.delete('/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const result = await query('DELETE FROM request_templates WHERE id = $1 AND "userId" = $2 RETURNING id', [req.params.id, req.user!.userId]);
        if (result.rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Template not found' })); return; }
        res.json(ApiResponse.success({ message: 'Template deleted' }));
    } catch (error) {
        logErrorReport('deleteTemplate', SERVICE_NAME, error, ERROR_CODES.TEMPLATE_CRUD_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete template' }));
    }
}));

export default router;
