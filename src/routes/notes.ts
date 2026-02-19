import express, { Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { query } from '../utils/db';
import { z } from 'zod';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'NoteService';
const router = express.Router();

// --- Validation Schemas ---
const createNoteSchema = z.object({
    title: z.string().min(1).max(500),
    content_json: z.any().optional(),
    content_html: z.string().optional(),
    default_font: z.string().max(100).optional(),
});

const updateNoteSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    content_json: z.any().optional(),
    content_html: z.string().optional(),
    default_font: z.string().max(100).optional(),
});

// --- Sanitize HTML (basic XSS prevention) ---
function sanitizeHtml(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/\son\w+='[^']*'/gi, '')
        .replace(/javascript:/gi, '');
}

// GET all notes for a user (not deleted)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const result = await query(
            'SELECT id, title, default_font, is_pinned, "createdAt", "updatedAt" FROM notes WHERE "userId" = $1 AND is_deleted = false ORDER BY is_pinned DESC, "updatedAt" DESC',
            [userId]
        );
        res.json(ApiResponse.success({
            message: 'Notes fetched successfully',
            data: result.rows,
        }));
    } catch (error) {
        logErrorReport('getNotes', SERVICE_NAME, error, ERROR_CODES.NOTE_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch notes' }));
    }
});

// GET a single note by id
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const noteId = req.params.id;

        const result = await query(
            'SELECT * FROM notes WHERE id = $1 AND "userId" = $2 AND is_deleted = false',
            [noteId, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Note not found' }));
            return;
        }

        res.json(ApiResponse.success({
            message: 'Note fetched successfully',
            data: result.rows[0],
        }));
    } catch (error) {
        logErrorReport('getNoteById', SERVICE_NAME, error, ERROR_CODES.NOTE_FETCH_SINGLE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch note' }));
    }
});

// CREATE a new note
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { title, content_json, content_html, default_font } = createNoteSchema.parse(req.body);

        const safeHtml = content_html ? sanitizeHtml(content_html) : null;

        const result = await query(
            `INSERT INTO notes ("userId", title, content_json, content_html, default_font)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [userId, title, content_json ? JSON.stringify(content_json) : null, safeHtml, default_font || 'Inter']
        );

        res.status(201).json(ApiResponse.success({
            message: 'Note created successfully',
            data: result.rows[0],
        }));
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json(ApiResponse.error({ message: 'Validation failed' }));
            return;
        }
        logErrorReport('createNote', SERVICE_NAME, error, ERROR_CODES.NOTE_CREATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to create note' }));
    }
});

// UPDATE a note
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const noteId = req.params.id;
        const updates = updateNoteSchema.parse(req.body);

        const check = await query(
            'SELECT * FROM notes WHERE id = $1 AND "userId" = $2',
            [noteId, userId]
        );

        if (check.rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Note not found' }));
            return;
        }

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (updates.title !== undefined) {
            fields.push(`title = $${idx}`);
            values.push(updates.title);
            idx++;
        }
        if (updates.content_json !== undefined) {
            fields.push(`content_json = $${idx}`);
            values.push(JSON.stringify(updates.content_json));
            idx++;
        }
        if (updates.content_html !== undefined) {
            fields.push(`content_html = $${idx}`);
            values.push(sanitizeHtml(updates.content_html));
            idx++;
        }
        if (updates.default_font !== undefined) {
            fields.push(`default_font = $${idx}`);
            values.push(updates.default_font);
            idx++;
        }

        if (fields.length === 0) {
            res.json(ApiResponse.success({
                message: 'No changes made',
                data: check.rows[0],
            }));
            return;
        }

        fields.push(`"updatedAt" = CURRENT_TIMESTAMP`);
        values.push(noteId);
        values.push(userId);

        const queryText = `
            UPDATE notes
            SET ${fields.join(', ')}
            WHERE id = $${idx} AND "userId" = $${idx + 1}
            RETURNING *
        `;

        const result = await query(queryText, values);
        res.json(ApiResponse.success({
            message: 'Note updated successfully',
            data: result.rows[0],
        }));
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json(ApiResponse.error({ message: 'Validation failed' }));
            return;
        }
        logErrorReport('updateNote', SERVICE_NAME, error, ERROR_CODES.NOTE_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update note' }));
    }
});

// DELETE a note (Soft Delete)
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const noteId = req.params.id;

        const result = await query(
            'UPDATE notes SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND "userId" = $2 RETURNING id',
            [noteId, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Note not found' }));
            return;
        }

        res.json(ApiResponse.success({ message: 'Note deleted successfully' }));
    } catch (error) {
        logErrorReport('deleteNote', SERVICE_NAME, error, ERROR_CODES.NOTE_DELETE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete note' }));
    }
});

// TOGGLE pin on a note
router.patch('/:id/pin', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const noteId = req.params.id;

        const result = await query(
            'UPDATE notes SET is_pinned = NOT is_pinned, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1 AND "userId" = $2 AND is_deleted = false RETURNING *',
            [noteId, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Note not found' }));
            return;
        }

        res.json(ApiResponse.success({
            message: 'Pin toggled successfully',
            data: result.rows[0],
        }));
    } catch (error) {
        logErrorReport('togglePin', SERVICE_NAME, error, ERROR_CODES.NOTE_PIN_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to toggle pin' }));
    }
});

// GET trash (soft-deleted notes)
router.get('/trash/list', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const result = await query(
            'SELECT id, title, default_font, "createdAt", "updatedAt", deleted_at FROM notes WHERE "userId" = $1 AND is_deleted = true ORDER BY deleted_at DESC',
            [userId]
        );
        res.json(ApiResponse.success({
            message: 'Trash fetched successfully',
            data: result.rows,
        }));
    } catch (error) {
        logErrorReport('getTrash', SERVICE_NAME, error, ERROR_CODES.NOTE_TRASH_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch trash' }));
    }
});

// RESTORE a deleted note
router.patch('/:id/restore', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const noteId = req.params.id;

        const result = await query(
            'UPDATE notes SET is_deleted = false, deleted_at = NULL WHERE id = $1 AND "userId" = $2 AND is_deleted = true RETURNING *',
            [noteId, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Note not found in trash' }));
            return;
        }

        res.json(ApiResponse.success({
            message: 'Note restored successfully',
            data: result.rows[0],
        }));
    } catch (error) {
        logErrorReport('restoreNote', SERVICE_NAME, error, ERROR_CODES.NOTE_RESTORE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to restore note' }));
    }
});

export default router;
