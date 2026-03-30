import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { adminMiddleware } from '../middleware/adminAuth';
import { catchAsync } from '../utils/catchAsync';
import { sendBrandedEmail } from '../utils/email';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const router = Router();
const SERVICE_NAME = 'EmailTemplateService';

// All routes require admin
router.use(authMiddleware as any);
router.use(adminMiddleware as any);

// ─── List all templates ─────────────────────────────────────────────

router.get('/', catchAsync(async (_req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query('SELECT * FROM email_templates ORDER BY category, purpose');
        res.json(ApiResponse.success({ message: 'Email templates fetched', data: rows }));
    } catch (error: any) {
        logErrorReport('listTemplates', SERVICE_NAME, error, ERROR_CODES.EMAIL_TEMPLATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch email templates' }));
    }
}));

// ─── Get single template ────────────────────────────────────────────

router.get('/:id', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
        if (rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Template not found' })); return; }
        res.json(ApiResponse.success({ message: 'Template fetched', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('getTemplate', SERVICE_NAME, error, ERROR_CODES.EMAIL_TEMPLATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch email template' }));
    }
}));

// ─── Create template ────────────────────────────────────────────────

const createSchema = z.object({
    name: z.string().min(1).max(255),
    subject: z.string().min(1).max(500),
    body: z.string().min(1),
    variables: z.array(z.string()).default([]),
    purpose: z.string().min(1).max(50),
    category: z.string().min(1).max(30).default('general'),
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
});

router.post('/', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = createSchema.parse(req.body);
        const { rows } = await query(
            `INSERT INTO email_templates (name, subject, body, variables, purpose, category, "isActive", "isDefault")
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) RETURNING *`,
            [data.name, data.subject, data.body, JSON.stringify(data.variables), data.purpose, data.category, data.isActive, data.isDefault]
        );
        res.json(ApiResponse.success({ message: 'Template created', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('createTemplate', SERVICE_NAME, error, ERROR_CODES.EMAIL_TEMPLATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to create email template' }));
    }
}));

// ─── Update template ────────────────────────────────────────────────

const updateSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    subject: z.string().min(1).max(500).optional(),
    body: z.string().min(1).optional(),
    variables: z.array(z.string()).optional(),
    purpose: z.string().min(1).max(50).optional(),
    category: z.string().min(1).max(30).optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
});

router.patch('/:id', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = updateSchema.parse(req.body);

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (data.name !== undefined) { fields.push(`name = $${idx}`); values.push(data.name); idx++; }
        if (data.subject !== undefined) { fields.push(`subject = $${idx}`); values.push(data.subject); idx++; }
        if (data.body !== undefined) { fields.push(`body = $${idx}`); values.push(data.body); idx++; }
        if (data.variables !== undefined) { fields.push(`variables = $${idx}::jsonb`); values.push(JSON.stringify(data.variables)); idx++; }
        if (data.purpose !== undefined) { fields.push(`purpose = $${idx}`); values.push(data.purpose); idx++; }
        if (data.category !== undefined) { fields.push(`category = $${idx}`); values.push(data.category); idx++; }
        if (data.isActive !== undefined) { fields.push(`"isActive" = $${idx}`); values.push(data.isActive); idx++; }
        if (data.isDefault !== undefined) { fields.push(`"isDefault" = $${idx}`); values.push(data.isDefault); idx++; }

        if (fields.length === 0) { res.status(400).json(ApiResponse.error({ message: 'No fields to update' })); return; }

        fields.push(`"updatedAt" = NOW()`);
        values.push(req.params.id);

        const { rows } = await query(
            `UPDATE email_templates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );
        if (rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Template not found' })); return; }
        res.json(ApiResponse.success({ message: 'Template updated', data: rows[0] }));
    } catch (error: any) {
        logErrorReport('updateTemplate', SERVICE_NAME, error, ERROR_CODES.EMAIL_TEMPLATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update email template' }));
    }
}));

// ─── Delete template ────────────────────────────────────────────────

router.delete('/:id', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const result = await query('DELETE FROM email_templates WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Template not found' })); return; }
        res.json(ApiResponse.success({ message: 'Template deleted' }));
    } catch (error: any) {
        logErrorReport('deleteTemplate', SERVICE_NAME, error, ERROR_CODES.EMAIL_TEMPLATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete email template' }));
    }
}));

// ─── Send test email ────────────────────────────────────────────────

const testSchema = z.object({
    to: z.string().email(),
    variables: z.record(z.string()).default({}),
});

router.post('/:id/test', catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { to, variables } = testSchema.parse(req.body);

        const { rows } = await query('SELECT purpose FROM email_templates WHERE id = $1', [req.params.id]);
        if (rows.length === 0) { res.status(404).json(ApiResponse.error({ message: 'Template not found' })); return; }

        await sendBrandedEmail(to, rows[0].purpose, variables);
        res.json(ApiResponse.success({ message: `Test email sent to ${to}` }));
    } catch (error: any) {
        logErrorReport('sendTestEmail', SERVICE_NAME, error, ERROR_CODES.EMAIL_TEMPLATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to send test email' }));
    }
}));

// ─── Email logs ─────────────────────────────────────────────────────

router.get('/logs/all', catchAsync(async (_req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query(
            `SELECT el.*, et.name as "templateName", et.purpose
             FROM email_logs el
             LEFT JOIN email_templates et ON el."templateId" = et.id
             ORDER BY el."sentAt" DESC LIMIT 100`
        );
        res.json(ApiResponse.success({ message: 'Email logs fetched', data: rows }));
    } catch (error: any) {
        logErrorReport('getEmailLogs', SERVICE_NAME, error, ERROR_CODES.EMAIL_TEMPLATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch email logs' }));
    }
}));

export default router;
