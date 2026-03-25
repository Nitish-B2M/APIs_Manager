import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

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

export async function sendEmail(to: string, subject: string, html: string) {
    // If no SMTP host or missing auth, log the email link (useful for dev)
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log(`[Email Mock] No valid SMTP config found. Falling back to console logging.`);
        console.log(`[Email Mock] To: ${to}, Subject: ${subject}`);
        console.log(`[Email Mock] Body: ${html}`);
        return;
    }

    try {
        if (!transporter) throw new Error('SMTP transporter not initialized');

        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"DevManus Docs" <noreply@example.com>',
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

export function parseTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return vars[key] || match;
    });
}
