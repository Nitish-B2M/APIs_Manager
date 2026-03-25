import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { query } from '../utils/db';
import { z } from 'zod';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { checkAccess, canEdit, canAdmin } from '../utils/rbac';
import { ERROR_CODES } from '../constants/errorCodes';
import { webhookService } from '../services/webhookService';
import { auditService } from '../services/auditService';
import { generateOpenApiSpec } from '../utils/openApiGenerator';
import { generatePostmanCollection } from '../utils/postmanGenerator';


const SERVICE_NAME = 'DocumentationService';
const router = Router();

// List all documentations for current user
router.get('/list', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query(
            `SELECT d.*, 
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'id', r.id,
                                'name', r.name,
                                'method', r.method,
                                'protocol', r.protocol,
                                'url', r.url,
                                'description', r.description,
                                'body', r.body,
                                'headers', r.headers,
                                'lastResponse', r."lastResponse",
                                'history', r.history,
                                'folderId', r."folderId",
                                'order', r."order",
                                'assertions', r.assertions,
                                'responseSchema', r."responseSchema",
                                'updatedAt', r."updatedAt"
                            )
                        ) FILTER (WHERE r.id IS NOT NULL),
                        '[]'
                    ) as requests,
                    COALESCE(
                        (SELECT json_agg(f.*) FROM folders f WHERE f."documentationId" = d.id),
                        '[]'
                    ) as folders
             FROM documentation d
             LEFT JOIN requests r ON d.id = r."documentationId"
             WHERE d."userId" = $1 OR d.id IN (SELECT "documentationId" FROM documentation_collaborators WHERE "userId" = $1)
             GROUP BY d.id
             ORDER BY d."updatedAt" DESC`,
            [req.user!.userId]
        );

        const docsWithCollaborators = await Promise.all(rows.map(async (doc: any) => {
            const { rows: collaborators } = await query(
                `SELECT c.id, c.role::text as role, u.name, u.email, u.avatar_url as "avatarUrl"
                 FROM documentation_collaborators c
                 JOIN users u ON c."userId" = u.id
                 WHERE c."documentationId" = $1
                 UNION
                 SELECT u.id, 'OWNER' as role, u.name, u.email, u.avatar_url as "avatarUrl"
                 FROM users u
                 WHERE u.id = $2`,
                [doc.id, doc.userId]
            );
            return { ...doc, collaborators };
        }));

        res.json(ApiResponse.success({
            message: 'Collections fetched successfully',
            data: docsWithCollaborators,
        }));
    } catch (error: any) {
        logErrorReport('listDocumentations', SERVICE_NAME, error, ERROR_CODES.DOC_LIST_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch collections' }));
    }
});

// Create new documentation
router.post('/create', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            title: z.string(),
            content: z.any(),
            layout: z.string().default('STANDARD'),
        });

        const input = schema.parse(req.body);

        const { extractEndpoints } = await import('../services/markdownGenerator');

        let parsedContent: any;
        if (typeof input.content === 'string') {
            parsedContent = JSON.parse(input.content);
        } else {
            parsedContent = input.content;
        }

        const endpoints = extractEndpoints(parsedContent.item || []);

        try {
            await query('BEGIN');

            const docResult = await query(
                'INSERT INTO documentation (title, content, layout, "userId") VALUES ($1, $2, $3, $4) RETURNING *',
                [input.title, JSON.stringify({
                    collection: parsedContent.info,
                    variables: {}
                }), input.layout, req.user!.userId]
            );
            const docId = docResult.rows[0].id;

            for (let i = 0; i < endpoints.length; i++) {
                const ep = endpoints[i];
                await query(
                    `INSERT INTO requests ("documentationId", name, method, protocol, url, description, body, headers, "order") 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        docId,
                        ep.name,
                        ep.method,
                        ep.protocol || 'REST',
                        ep.url,
                        ep.description,
                        JSON.stringify(ep.body),
                        JSON.stringify(ep.headers),
                        i
                    ]
                );
            }

            await query('COMMIT');

            const { rows: requests } = await query('SELECT * FROM requests WHERE "documentationId" = $1 ORDER BY "order" ASC', [docId]);
            const finalDoc = docResult.rows[0];
            finalDoc.requests = requests;

            res.json(ApiResponse.success({
                message: 'Collection created successfully',
                data: finalDoc,
            }));
        } catch (dbError) {
            await query('ROLLBACK');
            throw dbError;
        }
    } catch (error: any) {
        logErrorReport('createDocumentation', SERVICE_NAME, error, ERROR_CODES.DOC_CREATE_FAILED);
        res.status(400).json(ApiResponse.error({ message: 'Failed to create collection' }));
    }
});

// Create empty documentation
router.post('/create-empty', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            title: z.string(),
            description: z.string().optional()
        });

        const input = schema.parse(req.body);
        const content = {
            collection: {
                name: input.title,
                description: input.description || ''
            },
            variables: {}
        };

        const result = await query(
            'INSERT INTO documentation (title, content, layout, "userId") VALUES ($1, $2, $3, $4) RETURNING *',
            [input.title, JSON.stringify(content), 'STANDARD', req.user!.userId]
        );
        res.json(ApiResponse.success({
            message: 'Empty collection created',
            data: result.rows[0],
        }));
    } catch (error: any) {
        logErrorReport('createEmptyDocumentation', SERVICE_NAME, error, ERROR_CODES.DOC_CREATE_EMPTY_FAILED);
        res.status(400).json(ApiResponse.error({ message: 'Failed to create empty collection' }));
    }
});

// Delete documentation
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const access = await checkAccess(id, req.user!.userId);

        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required to delete collection' }));
            return;
        }

        const { rows } = await query('DELETE FROM documentation WHERE id = $1 RETURNING *', [id]);
        res.json(ApiResponse.success({
            message: 'Collection deleted',
            data: rows[0],
        }));
    } catch (error: any) {
        logErrorReport('deleteDocumentation', SERVICE_NAME, error, ERROR_CODES.DOC_DELETE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete collection' }));
    }
});

// Toggle public status
router.patch('/:id/toggle-public', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { isPublic } = req.body;

        const access = await checkAccess(id, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Admin access required to toggle visibility' }));
            return;
        }

        const { rows } = await query(
            'UPDATE documentation SET "isPublic" = $2 WHERE id = $1 RETURNING *',
            [id, isPublic]
        );
        res.json(ApiResponse.success({
            message: `Collection set to ${isPublic ? 'public' : 'private'}`,
            data: rows[0],
        }));
    } catch (error: any) {
        logErrorReport('togglePublic', SERVICE_NAME, error, ERROR_CODES.DOC_TOGGLE_PUBLIC_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to toggle visibility' }));
    }
});

// Update documentation (handles general content/variables)
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { content, title } = req.body;

        const access = await checkAccess(id, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required to update collection' }));
            return;
        }

        const updates: string[] = [];
        const values: any[] = [];
        let count = 1;

        if (title !== undefined) {
            updates.push(`title = $${count}`);
            values.push(title);
            count++;
        }
        if (content !== undefined) {
            updates.push(`content = $${count}`);
            values.push(typeof content === 'string' ? content : JSON.stringify(content));
            count++;
        }

        if (updates.length > 0) {
            values.push(id);
            await query(
                `UPDATE documentation SET ${updates.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $${count}`,
                values
            );
        }

        res.json(ApiResponse.success({ message: 'Collection updated' }));
    } catch (error: any) {
        logErrorReport('updateDocumentation', SERVICE_NAME, error, ERROR_CODES.DOC_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update collection' }));
    }
});

// Bulk delete requests
router.post('/request/bulk-delete', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            requestIds: z.array(z.string().uuid())
        });
        const { requestIds } = schema.parse(req.body);

        if (requestIds.length === 0) {
            res.status(400).json(ApiResponse.error({ message: 'No request IDs provided' }));
            return;
        }

        const { rows: reqs } = await query('SELECT "documentationId" FROM requests WHERE id = $1', [requestIds[0]]);
        if (!reqs[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Requests not found' }));
            return;
        }

        const docId = reqs[0].documentationId;
        const access = await checkAccess(docId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required' }));
            return;
        }

        await query('BEGIN');
        try {
            await query('DELETE FROM requests WHERE id = ANY($1) AND "documentationId" = $2', [requestIds, docId]);
            await query('UPDATE documentation SET "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1', [docId]);
            await query('COMMIT');
            res.json(ApiResponse.success({ message: `${requestIds.length} requests deleted` }));
        } catch (err) {
            await query('ROLLBACK');
            throw err;
        }
    } catch (error: any) {
        logErrorReport('bulkDeleteRequests', SERVICE_NAME, error, 'DOC_BULK_DELETE_FAILED');
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete requests' }));
    }
});

// Bulk move requests to a folder
router.patch('/request/bulk-move', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            requestIds: z.array(z.string().uuid()),
            folderId: z.string().uuid().nullable()
        });
        const { requestIds, folderId } = schema.parse(req.body);

        if (requestIds.length === 0) {
            res.status(400).json(ApiResponse.error({ message: 'No request IDs provided' }));
            return;
        }

        const { rows: reqs } = await query('SELECT "documentationId" FROM requests WHERE id = $1', [requestIds[0]]);
        if (!reqs[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Requests not found' }));
            return;
        }

        const docId = reqs[0].documentationId;
        const access = await checkAccess(docId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required' }));
            return;
        }

        await query('BEGIN');
        try {
            await query('UPDATE requests SET "folderId" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ANY($2::uuid[]) AND "documentationId" = $3', [folderId, requestIds, docId]);
            await query('UPDATE documentation SET "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1', [docId]);
            await query('COMMIT');
            res.json(ApiResponse.success({ message: `${requestIds.length} requests moved` }));
        } catch (err) {
            await query('ROLLBACK');
            throw err;
        }
    } catch (error: any) {
        logErrorReport('bulkMoveRequests', SERVICE_NAME, error, 'DOC_BULK_MOVE_FAILED');
        res.status(500).json(ApiResponse.error({ message: 'Failed to move requests' }));
    }
});

// Update a single request
router.patch('/request/:requestId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { requestId } = req.params;
        const body = req.body;

        const { rows: reqs } = await query('SELECT "documentationId" FROM requests WHERE id = $1', [requestId]);
        if (!reqs[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Request not found' }));
            return;
        }

        const docId = reqs[0].documentationId;
        const access = await checkAccess(docId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden: Editor access required' }));
            return;
        }

        const fields = ['name', 'method', 'protocol', 'url', 'description', 'body', 'headers', 'params', 'lastResponse', 'history', 'order', 'folderId', 'auth', 'assertions', 'responseSchema'];
        const updates: string[] = [];
        const values: any[] = [];
        let count = 1;

        fields.forEach(field => {
            if (body[field] !== undefined) {
                updates.push(`"${field}" = $${count}`);
                values.push((typeof body[field] === 'object' && body[field] !== null) ? JSON.stringify(body[field]) : body[field]);
                count++;
            }
        });

        if (updates.length === 0) {
            res.status(400).json(ApiResponse.error({ message: 'No fields to update' }));
            return;
        }

        values.push(requestId);
        const { rows: updatedReq } = await query(
            `UPDATE requests SET ${updates.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $${count} RETURNING *`,
            values
        );

        await query('UPDATE documentation SET "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1', [docId]);

        // Audit Log
        auditService.log({
            documentationId: docId,
            userId: req.user!.userId,
            action: 'UPDATE',
            entityType: 'REQUEST',
            entityName: updatedReq[0].name,
            changes: body
        });

        res.json(ApiResponse.success({
            message: 'Request updated successfully',
            data: updatedReq[0],
        }));
    } catch (error: any) {
        logErrorReport('updateRequest', SERVICE_NAME, error, ERROR_CODES.DOC_REQUEST_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update request' }));
    }
});

// Delete a single request
router.delete('/request/:requestId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { requestId } = req.params;
        const { rows: reqs } = await query('SELECT "documentationId", name FROM requests WHERE id = $1', [requestId]);
        if (!reqs[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Request not found' }));
            return;
        }

        const docId = reqs[0].documentationId;
        const access = await checkAccess(docId, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        await query('DELETE FROM requests WHERE id = $1', [requestId]);
        await query('UPDATE documentation SET "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1', [docId]);

        // Audit Log
        auditService.log({
            documentationId: docId,
            userId: req.user!.userId,
            action: 'DELETE',
            entityType: 'REQUEST',
            entityName: reqs[0].name
        });

        res.json(ApiResponse.success({ message: 'Request deleted successfully' }));
    } catch (error: any) {
        logErrorReport('deleteRequest', SERVICE_NAME, error, ERROR_CODES.DOC_REQUEST_DELETE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete request' }));
    }
});

// Reorder requests in a documentation
router.patch('/:id/requests/reorder', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const schema = z.object({
            requests: z.array(z.object({
                id: z.string().uuid(),
                order: z.number()
            }))
        });

        const input = schema.parse(req.body);
        const access = await checkAccess(id, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        await query('BEGIN');
        try {
            for (const reqOrder of input.requests) {
                await query(
                    'UPDATE requests SET "order" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2 AND "documentationId" = $3',
                    [reqOrder.order, reqOrder.id, id]
                );
            }
            await query('UPDATE documentation SET "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1', [id]);
            await query('COMMIT');
            res.json(ApiResponse.success({ message: 'Reordered successfully' }));
        } catch (err) {
            await query('ROLLBACK');
            throw err;
        }
    } catch (error: any) {
        logErrorReport('reorderRequests', SERVICE_NAME, error, ERROR_CODES.DOC_REORDER_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to reorder requests' }));
    }
});

// Create a new request for a documentation
router.post('/:id/request', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { name, method, url, folderId } = req.body;

        const access = await checkAccess(id, req.user!.userId);
        if (!access.hasAccess || !canEdit(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        const { rows: countRes } = await query('SELECT COUNT(*) FROM requests WHERE "documentationId" = $1', [id]);
        const order = parseInt(countRes[0].count);

        const { rows } = await query(
            `INSERT INTO requests ("documentationId", name, method, protocol, url, "order", body, headers, params, "folderId", assertions) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [id, name || 'New Request', method || 'GET', 'REST', url || '', order, JSON.stringify({ mode: 'raw', raw: '' }), '[]', '[]', folderId || null, '[]']
        );

        await query('UPDATE documentation SET "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1', [id]);

        webhookService.dispatch({
            event: 'request.created',
            documentationId: id,
            payload: { requestId: rows[0].id, name: rows[0].name, method: rows[0].method, url: rows[0].url }
        });

        auditService.log({
            documentationId: id,
            userId: req.user!.userId,
            action: 'CREATE',
            entityType: 'REQUEST',
            entityName: rows[0].name
        });

        res.json(ApiResponse.success({ message: 'Request created', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('createRequest', SERVICE_NAME, error, ERROR_CODES.DOC_REQUEST_CREATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to create request' }));
    }
});

// Get by ID
router.get('/:id', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { rows } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        const doc = rows[0];

        if (!doc) {
            res.status(404).json(ApiResponse.error({ message: 'Not found' }));
            return;
        }

        const access = await checkAccess(id, req.user?.userId || '');
        if (!access.hasAccess) {
            if (!req.user) {
                res.status(401).json(ApiResponse.error({ message: 'Login required' }));
                return;
            }
            res.status(404).json(ApiResponse.error({ message: 'Not found' }));
            return;
        }

        const { rows: requests } = await query('SELECT * FROM requests WHERE "documentationId" = $1 ORDER BY "order" ASC', [id]);
        const { rows: folders } = await query('SELECT * FROM folders WHERE "documentationId" = $1 ORDER BY "order" ASC', [id]);
        
        doc.requests = requests;
        doc.folders = folders;
        doc.role = access.role;

        res.json(ApiResponse.success({ message: 'Documentation fetched', data: doc }));
    } catch (error: any) {
        logErrorReport('getById', SERVICE_NAME, error, ERROR_CODES.DOC_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch documentation' }));
    }
});

// Update slug
router.patch('/:id/slug', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { slug } = req.body;

        const access = await checkAccess(id, req.user!.userId);
        if (!access.hasAccess || !canAdmin(access.role)) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        await query('UPDATE documentation SET slug = $1 WHERE id = $2', [slug, id]);
        res.json(ApiResponse.success({ message: 'Slug updated' }));
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: 'Failed to update slug' }));
    }
});

// Get audit logs
router.get('/:id/audit-logs', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const access = await checkAccess(id, req.user!.userId);
        if (!access.hasAccess) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        const logs = await auditService.getLogs(id);
        res.json(ApiResponse.success({ message: 'Logs fetched', data: logs }));
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch logs' }));
    }
});
// Export to Postman Collection v2.1.0
router.get('/:id/export/postman', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { rows } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        const doc = rows[0];

        if (!doc) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        const access = await checkAccess(id, req.user!.userId);
        if (!access.hasAccess) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        const { rows: requests } = await query('SELECT * FROM requests WHERE "documentationId" = $1 ORDER BY "order" ASC', [id]);
        const { rows: folders } = await query('SELECT * FROM folders WHERE "documentationId" = $1 ORDER BY "order" ASC', [id]);

        const collection = generatePostmanCollection(doc, requests, folders);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.title.replace(/\s+/g, '_')}_collection.json"`);
        res.json(collection);
    } catch (error: any) {
        logErrorReport('exportPostman', SERVICE_NAME, error, 'EXPORT_FAILED');
        res.status(500).json(ApiResponse.error({ message: 'Failed to export to Postman' }));
    }
});

// Export to OpenAPI 3.1.0
router.get('/:id/export/openapi', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { rows } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        const doc = rows[0];

        if (!doc) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        const access = await checkAccess(id, req.user!.userId);
        if (!access.hasAccess) {
            res.status(403).json(ApiResponse.error({ message: 'Forbidden' }));
            return;
        }

        const { rows: requests } = await query('SELECT * FROM requests WHERE "documentationId" = $1 ORDER BY "order" ASC', [id]);
        const { rows: folders } = await query('SELECT * FROM folders WHERE "documentationId" = $1 ORDER BY "order" ASC', [id]);

        const spec = generateOpenApiSpec(doc, requests, folders);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.title.replace(/\s+/g, '_')}_openapi.json"`);
        res.json(spec);
    } catch (error: any) {
        logErrorReport('exportOpenApi', SERVICE_NAME, error, 'EXPORT_FAILED');
        res.status(500).json(ApiResponse.error({ message: 'Failed to export to OpenAPI' }));
    }
});

// Get public documentation by slug
router.get('/public/:slug', async (req: AuthRequest, res: Response) => {
    try {
        const { slug } = req.params;
        const { rows } = await query(
            'SELECT * FROM documentation WHERE slug = $1 AND "isPublic" = true',
            [slug]
        );
        const doc = rows[0];

        if (!doc) {
            res.status(404).json(ApiResponse.error({ message: 'Public documentation not found' }));
            return;
        }

        const { rows: requests } = await query('SELECT * FROM requests WHERE "documentationId" = $1 ORDER BY "order" ASC', [doc.id]);
        const { rows: folders } = await query('SELECT * FROM folders WHERE "documentationId" = $1 ORDER BY "order" ASC', [doc.id]);
        
        doc.requests = requests;
        doc.folders = folders;

        res.json(ApiResponse.success({ message: 'Public documentation fetched', data: doc }));
    } catch (error: any) {
        logErrorReport('getPublicBySlug', SERVICE_NAME, error, ERROR_CODES.DOC_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch public documentation' }));
    }
});

export default router;
