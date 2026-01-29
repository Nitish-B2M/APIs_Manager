import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { query } from '../utils/db';
import { z } from 'zod';

const router = Router();

// List all documentations for current user
router.get('/list', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        console.log('Fetching list for user:', req.user!.userId);
        
        // Get all documentation with their requests
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
             ORDER BY d."createdAt" DESC`,
            [req.user!.userId]
        );
        
        console.log(`Found ${rows.length} collections with requests`);
        
        res.json({
            status: true,
            message: 'Collections fetched successfully',
            data: rows,
            pagination: null
        });
    } catch (error: any) {
        console.error('Error fetching collections:', error);
        res.status(500).json({ status: false, message: 'Failed to fetch collections', error: error.message });
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

            // 1. Create documentation header
            const docResult = await query(
                'INSERT INTO documentation (title, content, layout, "userId") VALUES ($1, $2, $3, $4) RETURNING *',
                [input.title, JSON.stringify({
                    collection: parsedContent.info,
                    variables: {}
                }), input.layout, req.user!.userId]
            );
            const docId = docResult.rows[0].id;

            // 2. Insert endpoints into requests table
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

            res.json({
                status: true,
                message: 'Collection created successfully',
                data: finalDoc,
                pagination: null
            });
        } catch (dbError) {
            await query('ROLLBACK');
            throw dbError;
        }
    } catch (error: any) {
        res.status(400).json({ status: false, message: 'Failed to create collection', error: error.message });
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
        res.json({
            status: true,
            message: 'Empty collection created',
            data: result.rows[0],
            pagination: null
        });
    } catch (error: any) {
        res.status(400).json({ status: false, message: 'Failed to create empty collection', error: error.message });
    }
});

// Delete documentation
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        const doc = docs[0];

        if (!doc || doc.userId !== req.user!.userId) {
            res.status(404).json({ status: false, message: 'Documentation not found', error: 'Not Found' });
            return;
        }

        const { rows } = await query('DELETE FROM documentation WHERE id = $1 RETURNING *', [id]);
        res.json({
            status: true,
            message: 'Collection deleted',
            data: rows[0],
            pagination: null
        });
    } catch (error: any) {
        res.status(500).json({ status: false, message: 'Failed to delete collection', error: error.message });
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
            res.status(404).json({ status: false, message: 'Documentation not found', error: 'Not Found' });
            return;
        }

        const { rows } = await query(
            'UPDATE documentation SET "isPublic" = $2 WHERE id = $1 RETURNING *',
            [id, isPublic]
        );
        res.json({
            status: true,
            message: `Collection set to ${isPublic ? 'public' : 'private'}`,
            data: rows[0],
            pagination: null
        });
    } catch (error: any) {
        res.status(500).json({ status: false, message: 'Failed to toggle visibility', error: error.message });
    }
});

// Update documentation (handles general content/variables)
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { content, title } = req.body;

        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(404).json({ status: false, message: 'Documentation not found' });
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

        res.json({ status: true, message: 'Collection updated' });
    } catch (error: any) {
        res.status(500).json({ status: false, message: 'Failed to update collection', error: error.message });
    }
});

// Update a single request
router.patch('/request/:requestId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { requestId } = req.params;
        const body = req.body;

        // Verify ownership via documentationId
        const { rows: reqs } = await query('SELECT "documentationId" FROM requests WHERE id = $1', [requestId]);
        if (!reqs[0]) {
            res.status(404).json({ status: false, message: 'Request not found' });
            return;
        }

        const docId = reqs[0].documentationId;
        const { rows: docs } = await query('SELECT "userId" FROM documentation WHERE id = $1', [docId]);
        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(403).json({ status: false, message: 'Unauthorized' });
            return;
        }

        const fields = ['name', 'method', 'url', 'description', 'body', 'headers', 'params', 'lastResponse', 'history', 'order'];
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
            res.status(400).json({ status: false, message: 'No fields to update' });
            return;
        }

        values.push(requestId);
        const { rows: updatedReq } = await query(
            `UPDATE requests SET ${updates.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $${count} RETURNING *`,
            values
        );

        res.json({
            status: true,
            message: 'Request updated successfully',
            data: updatedReq[0]
        });
    } catch (error: any) {
        res.status(500).json({ status: false, message: 'Failed to update request', error: error.message });
    }
});

// Create a new request for a documentation
router.post('/:id/request', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, method, url } = req.body;

        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        if (!docs[0] || docs[0].userId !== req.user!.userId) {
            res.status(404).json({ status: false, message: 'Documentation not found' });
            return;
        }

        const { rows: countRes } = await query('SELECT COUNT(*) FROM requests WHERE "documentationId" = $1', [id]);
        const order = parseInt(countRes[0].count);

        const { rows } = await query(
            `INSERT INTO requests ("documentationId", name, method, url, "order", body, headers, params) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [id, name || 'New Request', method || 'GET', url || '', order, '{}', '[]', '[]']
        );

        res.json({
            status: true,
            message: 'Request created',
            data: rows[0]
        });
    } catch (error: any) {
        res.status(500).json({ status: false, message: 'Failed to create request', error: error.message });
    }
});

// Get by ID (includes requests join)
router.get('/:id', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { rows } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        const doc = rows[0];

        if (!doc) {
            res.status(404).json({ status: false, message: 'Documentation not found', error: 'Not Found' });
            return;
        }

        const isOwner = req.user && doc.userId === req.user.userId;

        if (!doc.isPublic && !isOwner) {
            if (!req.user) {
                res.status(401).json({ status: false, message: 'This collection is private. Please login to view it.', error: 'Unauthorized' });
                return;
            }
            res.status(404).json({ status: false, message: 'Documentation not found', error: 'Not Found' });
            return;
        }

        const { rows: requests } = await query('SELECT * FROM requests WHERE "documentationId" = $1 ORDER BY "order" ASC', [id]);
        doc.requests = requests;

        res.json({
            status: true,
            message: 'Collection fetched successfully',
            data: doc,
            pagination: null
        });
    } catch (error: any) {
        res.status(500).json({ status: false, message: 'Failed to fetch collection', error: error.message });
    }
});


export default router;
