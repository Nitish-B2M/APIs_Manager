import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { query } from './db';
import { wrapInBrandedTemplate } from './emailWrapper';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const transporter = process.env.SMTP_HOST ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
}) : null;

/**
 * Low-level email send. Use `sendBrandedEmail` for template-based emails.
 */
export async function sendEmail(to: string, subject: string, html: string) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log(`[Email Mock] No valid SMTP config found. Falling back to console logging.`);
        console.log(`[Email Mock] To: ${to}, Subject: ${subject}`);
        console.log(`[Email Mock] Body: ${html}`);
        return;
    }

    try {
        if (!transporter) throw new Error('SMTP transporter not initialized');

        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"DevManus" <noreply@devmanus.io>',
            to,
            subject,
            html,
        });

        console.log('Message sent: %s', info.messageId);

        if (process.env.SMTP_HOST.includes('ethereal.email')) {
            console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
        }
    } catch (error: any) {
        console.error('SMTP Connection Details:', {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE,
            user: process.env.SMTP_USER ? '***' : 'MISSING',
        });
        console.error('Error sending email:', error.message || error);
        throw new Error(`Failed to send email: ${error.message || 'Unknown error'}`);
    }
}

/**
 * Replace {{variableName}} placeholders in a template string.
 */
export function parseTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return vars[key] || match;
    });
}

/**
 * Send a branded email using a DB-stored template.
 *
 * @param to - recipient email
 * @param purpose - template purpose key (e.g. 'WELCOME', 'PASSWORD_RESET')
 * @param vars - template variable values
 * @param options - optional overrides
 */
export async function sendBrandedEmail(
    to: string,
    purpose: string,
    vars: Record<string, string>,
    options?: { documentationId?: string; previewText?: string }
): Promise<void> {
    // Look up the active default template for this purpose
    const { rows: templateRows } = await query(
        `SELECT id, subject, body FROM email_templates
         WHERE purpose = $1 AND "isActive" = TRUE
         ORDER BY "isDefault" DESC LIMIT 1`,
        [purpose]
    );

    const template = templateRows[0];
    if (!template) {
        console.warn(`[Email] No active template found for purpose: ${purpose}. Skipping.`);
        return;
    }

    const subject = parseTemplate(template.subject, vars);
    const bodyContent = parseTemplate(template.body, vars);

    // Wrap in branded template
    const html = wrapInBrandedTemplate({
        body: bodyContent,
        previewText: options?.previewText,
    });

    // Send the email
    await sendEmail(to, subject, html);

    // Log the email
    try {
        await query(
            `INSERT INTO email_logs ("templateId", "recipientEmail", "documentationId", status)
             VALUES ($1, $2, $3, 'SENT')`,
            [template.id, to, options?.documentationId || null]
        );
    } catch (logErr) {
        console.error('[Email] Failed to log email send:', logErr);
    }
}
