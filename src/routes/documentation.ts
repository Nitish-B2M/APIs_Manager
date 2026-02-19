import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { query } from '../utils/db';
import { z } from 'zod';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

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
                                'url', r.url,
                                'description', r.description,
                                'body', r.body,
                                'headers', r.headers,
                                'lastResponse', r."lastResponse",
                                'history', r.history,
                                'folderId', r."folderId",
                                'order', r."order",
                                'updatedAt', r."updatedAt"
                            )
                        ) FILTER (WHERE r.id IS NOT NULL),
                        '[]'
                    ) as requests
             FROM documentation d
             LEFT JOIN requests r ON d.id = r."documentationId"
             WHERE d."userId" = $1
             GROUP BY d.id
             ORDER BY d."updatedAt" DESC`,
            [req.user!.userId]
        );

        res.json(ApiResponse.success({
            message: 'Collections fetched successfully',
            data: rows,
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
                    `INSERT INTO requests ("documentationId", name, method, url, description, body, headers, "order") 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        docId,
                        ep.name,
                        ep.method,
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
        const { id } = req.params;
        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        const doc = docs[0];

        if (!doc || doc.userId !== req.user!.userId) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
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
        const { id } = req.params;
        const { isPublic } = req.body;

        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        const doc = docs[0];

        if (!doc || doc.userId !== req.user!.userId) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
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
        const { id } = req.params;
        const { content, title } = req.body;

        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
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
        const { rows: docs } = await query('SELECT "userId" FROM documentation WHERE id = $1', [docId]);
        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(403).json(ApiResponse.error({ message: 'Unauthorized' }));
            return;
        }

        const fields = ['name', 'method', 'url', 'description', 'body', 'headers', 'params', 'lastResponse', 'history', 'order', 'folderId'];
        const updates: string[] = [];
        const values: any[] = [];
        let count = 1;

        fields.forEach(field => {
            if (body[field] !== undefined) {
                updates.push(`"${field}" = $${count}`);
                values.push(typeof body[field] === 'object' ? JSON.stringify(body[field]) : body[field]);
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

        // update documentation last updated
        await query(
            'UPDATE documentation SET "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1',
            [docId]
        );

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

        const { rows: reqs } = await query('SELECT "documentationId" FROM requests WHERE id = $1', [requestId]);
        if (!reqs[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Request not found' }));
            return;
        }

        const docId = reqs[0].documentationId;
        const { rows: docs } = await query('SELECT "userId" FROM documentation WHERE id = $1', [docId]);
        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(403).json(ApiResponse.error({ message: 'Unauthorized' }));
            return;
        }

        const { rows } = await query('DELETE FROM requests WHERE id = $1 RETURNING *', [requestId]);

        // update documentation last updated
        await query(
            'UPDATE documentation SET "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1',
            [docId]
        );

        res.json(ApiResponse.success({
            message: 'Request deleted successfully',
            data: rows[0],
        }));
    } catch (error: any) {
        logErrorReport('deleteRequest', SERVICE_NAME, error, ERROR_CODES.DOC_REQUEST_DELETE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete request' }));
    }
});

// Reorder requests in a documentation
router.patch('/:id/requests/reorder', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const schema = z.object({
            requests: z.array(z.object({
                id: z.string().uuid(),
                order: z.number()
            }))
        });

        const input = schema.parse(req.body);

        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
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

            // update documentation last updated
            await query(
                'UPDATE documentation SET "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1',
                [id]
            );

            await query('COMMIT');

            res.json(ApiResponse.success({
                message: 'Requests reordered successfully',
            }));
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error: any) {
        logErrorReport('reorderRequests', SERVICE_NAME, error, ERROR_CODES.DOC_REORDER_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to reorder requests' }));
    }
});

// Create a new request for a documentation
router.post('/:id/request', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, method, url, folderId } = req.body;

        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        if (folderId) {
            const { rows: folders } = await query(
                'SELECT id FROM folders WHERE id = $1 AND "documentationId" = $2',
                [folderId, id]
            );
            if (!folders[0]) {
                res.status(400).json(ApiResponse.error({ message: 'Folder not found in this documentation' }));
                return;
            }
        }

        const { rows: countRes } = await query('SELECT COUNT(*) FROM requests WHERE "documentationId" = $1', [id]);
        const order = parseInt(countRes[0].count);

        const { rows } = await query(
            `INSERT INTO requests ("documentationId", name, method, url, "order", body, headers, params, "folderId") 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [id, name || 'New Request', method || 'GET', url || '', order, '{}', '[]', '[]', folderId || null]
        );

        // update documentation last updated
        await query(
            'UPDATE documentation SET "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );

        res.json(ApiResponse.success({
            message: 'Request created',
            data: rows[0],
        }));
    } catch (error: any) {
        logErrorReport('createRequest', SERVICE_NAME, error, ERROR_CODES.DOC_REQUEST_CREATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to create request' }));
    }
});

// Get by ID (includes requests join)
router.get('/:id', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { rows } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        const doc = rows[0];

        if (!doc) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        const isOwner = req.user && doc.userId === req.user.userId;

        if (!doc.isPublic && !isOwner) {
            if (!req.user) {
                res.status(401).json(ApiResponse.error({ message: 'This collection is private. Please login to view it.' }));
                return;
            }
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        const { rows: requests } = await query('SELECT * FROM requests WHERE "documentationId" = $1 ORDER BY "order" ASC', [id]);
        doc.requests = requests;

        const { rows: folders } = await query(
            'SELECT * FROM folders WHERE "documentationId" = $1 ORDER BY "parentId" NULLS FIRST, "order" ASC',
            [id]
        );
        doc.folders = folders;

        res.json(ApiResponse.success({
            message: 'Collection fetched successfully',
            data: doc,
        }));
    } catch (error: any) {
        logErrorReport('getDocumentation', SERVICE_NAME, error, ERROR_CODES.DOC_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch collection' }));
    }
});

// Get code snippets for a request
router.get('/request/:requestId/snippets', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { requestId } = req.params;
        const { generateAllSnippets } = await import('../utils/codeGenerator');

        const { rows: reqs } = await query('SELECT * FROM requests WHERE id = $1', [requestId]);
        if (!reqs[0]) {
            res.status(404).json(ApiResponse.error({ message: 'Request not found' }));
            return;
        }

        const request = reqs[0];
        const snippets = generateAllSnippets({
            method: request.method,
            url: request.url,
            headers: Array.isArray(request.headers) ? request.headers : [],
            body: typeof request.body === 'object' ? { mode: 'raw', raw: JSON.stringify(request.body) } : undefined,
        });

        res.json(ApiResponse.success({
            message: 'Snippets generated',
            data: snippets,
        }));
    } catch (error: any) {
        logErrorReport('getSnippets', SERVICE_NAME, error, ERROR_CODES.DOC_SNIPPETS_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to generate snippets' }));
    }
});

// Get public documentation by slug
router.get('/public/:slug', async (req: AuthRequest, res: Response) => {
    try {
        const { slug } = req.params;

        const { rows: docs } = await query(
            `SELECT * FROM documentation WHERE slug = $1 AND "isPublic" = true`,
            [slug]
        );
        const doc = docs[0];

        if (!doc) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        const { rows: requests } = await query(
            `SELECT id, name, method, url, description, body, headers, params, "lastResponse", "order", "folderId" FROM requests WHERE "documentationId" = $1 ORDER BY "order" ASC`,
            [doc.id]
        );
        doc.requests = requests;

        const { rows: folders } = await query(
            `SELECT * FROM folders WHERE "documentationId" = $1 ORDER BY "parentId" NULLS FIRST, "order" ASC`,
            [doc.id]
        );
        doc.folders = folders;

        delete doc.userId;

        res.json(ApiResponse.success({
            message: 'Public documentation fetched',
            data: doc,
        }));
    } catch (error: any) {
        logErrorReport('getPublicDocumentation', SERVICE_NAME, error, ERROR_CODES.DOC_PUBLIC_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch documentation' }));
    }
});

// Update documentation slug
router.patch('/:id/slug', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const schema = z.object({
            slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
        });

        const input = schema.parse(req.body);

        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(404).json(ApiResponse.error({ message: 'Documentation not found' }));
            return;
        }

        const { rows: existing } = await query('SELECT id FROM documentation WHERE slug = $1 AND id != $2', [input.slug, id]);
        if (existing.length > 0) {
            res.status(409).json(ApiResponse.error({ message: 'This slug is already taken' }));
            return;
        }

        const { rows } = await query(
            `UPDATE documentation SET slug = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
            [input.slug, id]
        );

        res.json(ApiResponse.success({
            message: 'Slug updated successfully',
            data: rows[0],
        }));
    } catch (error: any) {
        logErrorReport('updateSlug', SERVICE_NAME, error, ERROR_CODES.DOC_SLUG_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update slug' }));
    }
});

export default router;
