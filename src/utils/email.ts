import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export async function sendEmail(to: string, subject: string, html: string) {
    // If no SMTP config, log the email link (useful for dev)
    if (!process.env.SMTP_HOST) {
        console.log(`[Email Mock] To: ${to}, Subject: ${subject}`);
        console.log(`[Email Mock] Body: ${html}`);
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Postman Docs" <noreply@example.com>',
            to,
            subject,
            html,
        });

        console.log('Message sent: %s', info.messageId);

        // Preview only available when sending through an Ethereal account
        if (process.env.SMTP_HOST.includes('ethereal.email')) {
            console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send email');
    }
}
