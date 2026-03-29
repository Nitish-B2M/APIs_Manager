import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

// ─── List user's tags ────────────────────────────────────────────────

router.get('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const { rows } = await query(
        `SELECT t.*, COUNT(et.id)::int as "usageCount"
         FROM tags t LEFT JOIN entity_tags et ON t.id = et."tagId"
         WHERE t."userId" = $1 GROUP BY t.id ORDER BY t.name ASC`,
        [req.user!.userId]
    );
    res.json(ApiResponse.success({ message: 'Tags fetched', data: rows }));
}));

// ─── Create tag ──────────────────────────────────────────────────────

const createSchema = z.object({
    name: z.string().min(1).max(50),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
});

router.post('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const data = createSchema.parse(req.body);
    const { rows } = await query(
        'INSERT INTO tags ("userId", name, color) VALUES ($1, $2, $3) ON CONFLICT ("userId", name) DO UPDATE SET color = $3 RETURNING *',
        [req.user!.userId, data.name, data.color]
    );
    res.json(ApiResponse.success({ message: 'Tag created', data: rows[0] }));
}));

// ─── Update tag ──────────────────────────────────────────────────────

const updateSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

router.patch('/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const data = updateSchema.parse(req.body);
    const { id } = req.params;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (data.name) { fields.push(`name = $${idx}`); values.push(data.name); idx++; }
    if (data.color) { fields.push(`color = $${idx}`); values.push(data.color); idx++; }
    if (fields.length === 0) { res.status(400).json(ApiResponse.error({ message: 'Nothing to update' })); return; }

    values.push(id, req.user!.userId);
    const { rows } = await query(`UPDATE tags SET ${fields.join(', ')} WHERE id = $${idx} AND "userId" = $${idx + 1} RETURNING *`, values);
    if (rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Tag not found' })); return; }
    res.json(ApiResponse.success({ message: 'Tag updated', data: rows[0] }));
}));

// ─── Delete tag ──────────────────────────────────────────────────────

router.delete('/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const result = await query('DELETE FROM tags WHERE id = $1 AND "userId" = $2 RETURNING id', [req.params.id, req.user!.userId]);
    if (result.rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Tag not found' })); return; }
    res.json(ApiResponse.success({ message: 'Tag deleted' }));
}));

// ─── Assign tag to entity ────────────────────────────────────────────

const assignSchema = z.object({
    tagId: z.string().uuid(),
    entityId: z.string().uuid(),
    entityType: z.enum(['request', 'collection', 'note']),
});

router.post('/assign', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const data = assignSchema.parse(req.body);

    // Verify tag ownership
    const { rows: tag } = await query('SELECT id FROM tags WHERE id = $1 AND "userId" = $2', [data.tagId, req.user!.userId]);
    if (tag.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Tag not found' })); return; }

    await query(
        'INSERT INTO entity_tags ("tagId", "entityId", "entityType") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [data.tagId, data.entityId, data.entityType]
    );
    res.json(ApiResponse.success({ message: 'Tag assigned' }));
}));

// ─── Remove tag from entity ──────────────────────────────────────────

router.post('/unassign', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const data = assignSchema.parse(req.body);
    await query(
        'DELETE FROM entity_tags WHERE "tagId" = $1 AND "entityId" = $2 AND "entityType" = $3',
        [data.tagId, data.entityId, data.entityType]
    );
    res.json(ApiResponse.success({ message: 'Tag removed' }));
}));

// ─── Get tags for an entity ──────────────────────────────────────────

router.get('/entity/:entityType/:entityId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const { entityType, entityId } = req.params;
    const { rows } = await query(
        `SELECT t.* FROM tags t JOIN entity_tags et ON t.id = et."tagId"
         WHERE et."entityId" = $1 AND et."entityType" = $2 AND t."userId" = $3
         ORDER BY t.name ASC`,
        [entityId, entityType, req.user!.userId]
    );
    res.json(ApiResponse.success({ message: 'Entity tags fetched', data: rows }));
}));

// ─── Search entities by tag ──────────────────────────────────────────

router.get('/search/:tagId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const { tagId } = req.params;
    const { rows } = await query(
        `SELECT et."entityId", et."entityType", et."createdAt" FROM entity_tags et
         JOIN tags t ON et."tagId" = t.id
         WHERE t.id = $1 AND t."userId" = $2
         ORDER BY et."createdAt" DESC`,
        [tagId, req.user!.userId]
    );
    res.json(ApiResponse.success({ message: 'Tagged entities fetched', data: rows }));
}));

// ─── Bulk assign tag to multiple entities ────────────────────────────

const bulkAssignSchema = z.object({
    tagId: z.string().uuid(),
    entityIds: z.array(z.string().uuid()).min(1).max(100),
    entityType: z.enum(['request', 'collection', 'note']),
});

router.post('/bulk-assign', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const data = bulkAssignSchema.parse(req.body);

    // Verify tag ownership
    const { rows: tag } = await query('SELECT id FROM tags WHERE id = $1 AND "userId" = $2', [data.tagId, req.user!.userId]);
    if (tag.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Tag not found' })); return; }

    let count = 0;
    for (const entityId of data.entityIds) {
        const result = await query(
            'INSERT INTO entity_tags ("tagId", "entityId", "entityType") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [data.tagId, entityId, data.entityType]
        );
        count += result.rowCount || 0;
    }

    res.json(ApiResponse.success({ message: `Tag assigned to ${count} entities` }));
}));

// ─── Bulk remove tag from multiple entities ──────────────────────────

router.post('/bulk-unassign', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const data = bulkAssignSchema.parse(req.body);
    const result = await query(
        'DELETE FROM entity_tags WHERE "tagId" = $1 AND "entityId" = ANY($2::uuid[]) AND "entityType" = $3',
        [data.tagId, data.entityIds, data.entityType]
    );
    res.json(ApiResponse.success({ message: `Tag removed from ${result.rowCount} entities` }));
}));

export default router;
