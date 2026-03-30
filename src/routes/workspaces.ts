import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const router = Router();
const SERVICE_NAME = 'WorkspaceService';

// ─── List user's workspaces ──────────────────────────────────────────

router.get('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const pg = parsePagination(req, { limit: 20 });
        const userId = req.user!.userId;

        const countResult = await query(
            `SELECT COUNT(DISTINCT w.id) FROM workspaces w
             LEFT JOIN workspace_members wm ON w.id = wm."workspaceId"
             WHERE w."ownerId" = $1 OR wm."userId" = $1`,
            [userId]
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const { rows } = await query(
            `SELECT DISTINCT w.*,
                (SELECT COUNT(*) FROM workspace_members WHERE "workspaceId" = w.id) as "memberCount",
                (SELECT COUNT(*) FROM documentation WHERE "workspaceId" = w.id) as "collectionCount",
                CASE WHEN w."ownerId" = $1 THEN 'OWNER'
                     ELSE (SELECT role FROM workspace_members WHERE "workspaceId" = w.id AND "userId" = $1)
                END as "myRole"
             FROM workspaces w
             LEFT JOIN workspace_members wm ON w.id = wm."workspaceId"
             WHERE w."ownerId" = $1 OR wm."userId" = $1
             ORDER BY w."updatedAt" DESC
             LIMIT $2 OFFSET $3`,
            [userId, pg.limit, pg.offset]
        );

        res.json(ApiResponse.success({ message: 'Workspaces fetched', data: rows, pagination: buildPaginationMeta(total, pg) }));
    } catch (error: any) {
        logErrorReport('listWorkspaces', SERVICE_NAME, error, ERROR_CODES.WORKSPACE_CRUD_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch workspaces' }));
    }
}));

// ─── Create workspace ────────────────────────────────────────────────

const createSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
});

router.post('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = createSchema.parse(req.body);
        const userId = req.user!.userId;

        const { rows } = await query(
            'INSERT INTO workspaces (name, description, "ownerId") VALUES ($1, $2, $3) RETURNING *',
            [data.name, data.description || null, userId]
        );

        // Auto-add owner as member
        await query(
            'INSERT INTO workspace_members ("workspaceId", "userId", role) VALUES ($1, $2, $3)',
            [rows[0].id, userId, 'OWNER']
        );

        res.json(ApiResponse.success({ message: 'Workspace created', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('createWorkspace', SERVICE_NAME, error, ERROR_CODES.WORKSPACE_CRUD_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to create workspace' }));
    }
}));

// ─── Get workspace details ───────────────────────────────────────────

router.get('/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const { rows } = await query('SELECT * FROM workspaces WHERE id = $1', [id]);
        if (rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Workspace not found' }));
            return;
        }

        // Check membership
        const { rows: membership } = await query(
            'SELECT role FROM workspace_members WHERE "workspaceId" = $1 AND "userId" = $2',
            [id, userId]
        );
        if (membership.length === 0 && rows[0].ownerId !== userId) {
            res.status(403).json(ApiResponse.error({ message: 'Not a member of this workspace' }));
            return;
        }

        // Get members
        const { rows: members } = await query(
            `SELECT wm.id, wm.role, wm."joinedAt", u.name, u.email, u.avatar_url as "avatarUrl"
             FROM workspace_members wm JOIN users u ON wm."userId" = u.id
             WHERE wm."workspaceId" = $1 ORDER BY wm."joinedAt" ASC`,
            [id]
        );

        // Get collections in this workspace
        const { rows: collections } = await query(
            'SELECT id, title, "isPublic", "updatedAt" FROM documentation WHERE "workspaceId" = $1 ORDER BY "updatedAt" DESC',
            [id]
        );

        res.json(ApiResponse.success({
            message: 'Workspace fetched',
            data: { ...rows[0], members, collections, myRole: membership[0]?.role || 'OWNER' },
        }));
    } catch (error: any) {
        logErrorReport('getWorkspace', SERVICE_NAME, error, ERROR_CODES.WORKSPACE_CRUD_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch workspace' }));
    }
}));

// ─── Update workspace ────────────────────────────────────────────────

const updateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    settings: z.record(z.any()).optional(),
});

router.patch('/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const data = updateSchema.parse(req.body);

        // Only owner/admin can update
        const { rows: membership } = await query(
            'SELECT role FROM workspace_members WHERE "workspaceId" = $1 AND "userId" = $2',
            [id, req.user!.userId]
        );
        if (!membership[0] || !['OWNER', 'ADMIN'].includes(membership[0].role)) {
            res.status(403).json(ApiResponse.error({ message: 'Admin access required' }));
            return;
        }

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (data.name !== undefined) { fields.push(`name = $${idx}`); values.push(data.name); idx++; }
        if (data.description !== undefined) { fields.push(`description = $${idx}`); values.push(data.description); idx++; }
        if (data.settings !== undefined) { fields.push(`settings = $${idx}`); values.push(data.settings); idx++; }

        if (fields.length === 0) { res.status(400).json(ApiResponse.error({ message: 'No fields to update' })); return; }

        fields.push(`"updatedAt" = NOW()`);
        values.push(id);
        const { rows } = await query(`UPDATE workspaces SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);

        res.json(ApiResponse.success({ message: 'Workspace updated', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('updateWorkspace', SERVICE_NAME, error, ERROR_CODES.WORKSPACE_CRUD_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update workspace' }));
    }
}));

// ─── Delete workspace ────────────────────────────────────────────────

router.delete('/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { rows } = await query('SELECT "ownerId" FROM workspaces WHERE id = $1', [id]);
        if (rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Not found' })); return; }
        if (rows[0].ownerId !== req.user!.userId) { res.status(403).json(ApiResponse.error({ message: 'Only owner can delete' })); return; }

        await query('DELETE FROM workspaces WHERE id = $1', [id]);
        res.json(ApiResponse.success({ message: 'Workspace deleted' }));
    } catch (error: any) {
        logErrorReport('deleteWorkspace', SERVICE_NAME, error, ERROR_CODES.WORKSPACE_CRUD_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete workspace' }));
    }
}));

// ─── Add member ──────────────────────────────────────────────────────

const addMemberSchema = z.object({
    email: z.string().email(),
    role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

router.post('/:id/members', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const data = addMemberSchema.parse(req.body);

        // Check admin access
        const { rows: membership } = await query(
            'SELECT role FROM workspace_members WHERE "workspaceId" = $1 AND "userId" = $2',
            [id, req.user!.userId]
        );
        if (!membership[0] || !['OWNER', 'ADMIN'].includes(membership[0].role)) {
            res.status(403).json(ApiResponse.error({ message: 'Admin access required' }));
            return;
        }

        // Find user by email
        const { rows: users } = await query('SELECT id FROM users WHERE email = $1', [data.email]);
        if (users.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'User not found with that email' }));
            return;
        }

        // Add member
        await query(
            'INSERT INTO workspace_members ("workspaceId", "userId", role) VALUES ($1, $2, $3) ON CONFLICT ("workspaceId", "userId") DO UPDATE SET role = $3',
            [id, users[0].id, data.role]
        );

        res.json(ApiResponse.success({ message: 'Member added' }));
    } catch (error: any) {
        logErrorReport('addMember', SERVICE_NAME, error, ERROR_CODES.WORKSPACE_MEMBER_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to add member' }));
    }
}));

// ─── Remove member ───────────────────────────────────────────────────

router.delete('/:id/members/:userId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id, userId } = req.params;

        const { rows: membership } = await query(
            'SELECT role FROM workspace_members WHERE "workspaceId" = $1 AND "userId" = $2',
            [id, req.user!.userId]
        );
        if (!membership[0] || !['OWNER', 'ADMIN'].includes(membership[0].role)) {
            res.status(403).json(ApiResponse.error({ message: 'Admin access required' }));
            return;
        }

        // Can't remove owner
        const { rows: ws } = await query('SELECT "ownerId" FROM workspaces WHERE id = $1', [id]);
        if (ws[0]?.ownerId === userId) {
            res.status(400).json(ApiResponse.error({ message: 'Cannot remove workspace owner' }));
            return;
        }

        await query('DELETE FROM workspace_members WHERE "workspaceId" = $1 AND "userId" = $2', [id, userId]);
        res.json(ApiResponse.success({ message: 'Member removed' }));
    } catch (error: any) {
        logErrorReport('removeMember', SERVICE_NAME, error, ERROR_CODES.WORKSPACE_MEMBER_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to remove member' }));
    }
}));

// ─── Move collection to workspace ────────────────────────────────────

router.patch('/:id/collections/:docId', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id, docId } = req.params;

        // Verify workspace membership
        const { rows: membership } = await query(
            'SELECT role FROM workspace_members WHERE "workspaceId" = $1 AND "userId" = $2',
            [id, req.user!.userId]
        );
        if (!membership[0]) { res.status(403).json(ApiResponse.error({ message: 'Not a member' })); return; }

        // Verify collection ownership
        const { rows: doc } = await query('SELECT "userId" FROM documentation WHERE id = $1', [docId]);
        if (doc.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Collection not found' })); return; }
        if (doc[0].userId !== req.user!.userId) { res.status(403).json(ApiResponse.error({ message: 'Only owner can move collection' })); return; }

        await query('UPDATE documentation SET "workspaceId" = $1 WHERE id = $2', [id, docId]);
        res.json(ApiResponse.success({ message: 'Collection moved to workspace' }));
    } catch (error: any) {
        logErrorReport('moveCollection', SERVICE_NAME, error, ERROR_CODES.WORKSPACE_CRUD_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to move collection' }));
    }
}));

export default router;
