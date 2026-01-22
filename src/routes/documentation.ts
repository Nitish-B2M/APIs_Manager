import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { query } from '../utils/db';
import { z } from 'zod';

const router = Router();

// List all documentations for current user
router.get('/list', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query(
            'SELECT * FROM documentation WHERE "userId" = $1 ORDER BY "createdAt" DESC',
            [req.user!.userId]
        );
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
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

        const result = await query(
            'INSERT INTO documentation (title, content, layout, "userId") VALUES ($1, $2, $3, $4) RETURNING *',
            [input.title, JSON.stringify({
                collection: parsedContent.info,
                endpoints
            }), input.layout, req.user!.userId]
        );
        res.json(result.rows[0]);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
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
            endpoints: []
        };

        const result = await query(
            'INSERT INTO documentation (title, content, layout, "userId") VALUES ($1, $2, $3, $4) RETURNING *',
            [input.title, JSON.stringify(content), 'STANDARD', req.user!.userId]
        );
        res.json(result.rows[0]);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
});

// Delete documentation
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        const doc = docs[0];

        if (!doc || doc.userId !== req.user!.userId) {
            res.status(404).json({ message: 'Documentation not found' });
            return;
        }

        const { rows } = await query('DELETE FROM documentation WHERE id = $1 RETURNING *', [id]);
        res.json(rows[0]);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// Update documentation
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { content } = req.body;

        const { rows: docs } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        const doc = docs[0];

        if (!doc || doc.userId !== req.user!.userId) {
            res.status(404).json({ message: 'Documentation not found' });
            return;
        }

        const contentString = typeof content === 'string' ? content : JSON.stringify(content);

        const { rows } = await query(
            'UPDATE documentation SET content = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [id, contentString]
        );
        res.json(rows[0]);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
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
            res.status(404).json({ message: 'Documentation not found' });
            return;
        }

        const { rows } = await query(
            'UPDATE documentation SET "isPublic" = $2 WHERE id = $1 RETURNING *',
            [id, isPublic]
        );
        res.json(rows[0]);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// Get by ID (includes public check)
router.get('/:id', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { rows } = await query('SELECT * FROM documentation WHERE id = $1', [id]);
        const doc = rows[0];

        if (!doc) {
            res.status(404).json({ message: 'Documentation not found' });
            return;
        }

        const isOwner = req.user && doc.userId === req.user.userId;

        if (!doc.isPublic && !isOwner) {
            if (!req.user) {
                res.status(401).json({ message: 'This collection is private. Please login to view it.' });
                return;
            }
            res.status(404).json({ message: 'Documentation not found' });
            return;
        }

        res.json(doc);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
