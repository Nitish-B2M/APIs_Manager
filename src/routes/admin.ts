import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/adminAuth';
import { query } from '../utils/db';
import { z } from 'zod';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'AdminService';
const router = Router();

// Apply auth and admin middleware to all routes
router.use(authMiddleware);
router.use(adminMiddleware);

// List all email templates
router.get('/templates', async (_req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query('SELECT * FROM email_templates ORDER BY "createdAt" DESC');
        res.json(ApiResponse.success({ message: 'Templates fetched', data: rows }));
    } catch (error: any) {
        logErrorReport('listTemplates', SERVICE_NAME, error, ERROR_CODES.ADMIN_TEMPLATE_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch templates' }));
    }
});

// Get a single template
router.get('/templates/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
        if (rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Template not found' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Template fetched', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('getTemplate', SERVICE_NAME, error, ERROR_CODES.ADMIN_TEMPLATE_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch template' }));
    }
});

// Create a new template
router.post('/templates', async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            name: z.string(),
            subject: z.string(),
            body: z.string(),
            variables: z.array(z.string()).default([]),
            isActive: z.boolean().default(true),
            isDefault: z.boolean().default(false),
            purpose: z.string()
        });

        const data = schema.parse(req.body);

        if (data.isDefault) {
            // Unset other defaults for the same purpose
            await query('UPDATE email_templates SET "isDefault" = FALSE WHERE purpose = $1', [data.purpose]);
        }

        const { rows } = await query(
            `INSERT INTO email_templates (name, subject, body, variables, "isActive", "isDefault", purpose) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [data.name, data.subject, data.body, JSON.stringify(data.variables), data.isActive, data.isDefault, data.purpose]
        );

        res.json(ApiResponse.success({ message: 'Template created', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('createTemplate', SERVICE_NAME, error, ERROR_CODES.ADMIN_TEMPLATE_CREATE_FAILED);
        res.status(error instanceof z.ZodError ? 400 : 500).json(ApiResponse.error({ message: error.message || 'Failed to create template' }));
    }
});

// Update a template
router.patch('/templates/:id', async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            name: z.string().optional(),
            subject: z.string().optional(),
            body: z.string().optional(),
            variables: z.array(z.string()).optional(),
            isActive: z.boolean().optional(),
            isDefault: z.boolean().optional(),
            purpose: z.string().optional()
        });

        const data = schema.parse(req.body);
        const { id } = req.params;

        if (data.isDefault === true) {
            // If setting this as default, we need to know the purpose first
            const { rows: current } = await query('SELECT purpose FROM email_templates WHERE id = $1', [id]);
            if (current.length > 0) {
                await query('UPDATE email_templates SET "isDefault" = FALSE WHERE purpose = $1', [current[0].purpose]);
            }
        }

        // Build dynamic update query
        const fields = Object.keys(data).filter(key => (data as any)[key] !== undefined);
        if (fields.length === 0) {
            res.status(400).json(ApiResponse.error({ message: 'No fields to update' }));
            return;
        }

        const values = fields.map(key => {
            const val = (data as any)[key];
            return key === 'variables' ? JSON.stringify(val) : val;
        });
        const setClause = fields.map((key, i) => `"${key}" = $${i + 2}`).join(', ');

        const { rows } = await query(
            `UPDATE email_templates SET ${setClause}, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [id, ...values]
        );

        if (rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'Template not found' }));
            return;
        }

        res.json(ApiResponse.success({ message: 'Template updated', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('updateTemplate', SERVICE_NAME, error, ERROR_CODES.ADMIN_TEMPLATE_UPDATE_FAILED);
        res.status(error instanceof z.ZodError ? 400 : 500).json(ApiResponse.error({ message: error.message || 'Failed to update template' }));
    }
});

// Delete a template
router.delete('/templates/:id', async (req: AuthRequest, res: Response) => {
    try {
        await query('DELETE FROM email_templates WHERE id = $1', [req.params.id]);
        res.json(ApiResponse.success({ message: 'Template deleted' }));
    } catch (error: any) {
        logErrorReport('deleteTemplate', SERVICE_NAME, error, ERROR_CODES.ADMIN_TEMPLATE_DELETE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete template' }));
    }
});

// List email logs (for analytics)
router.get('/logs', async (_req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query(`
            SELECT l.*, t.name as "templateName", d.title as "documentationTitle"
            FROM email_logs l
            LEFT JOIN email_templates t ON l."templateId" = t.id
            LEFT JOIN documentation d ON l."documentationId" = d.id
            ORDER BY l."sentAt" DESC
            LIMIT 100
        `);
        res.json(ApiResponse.success({ message: 'Logs fetched', data: rows }));
    } catch (error: any) {
        logErrorReport('listLogs', SERVICE_NAME, error, ERROR_CODES.ADMIN_LOGS_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch logs' }));
    }
});

export default router;
