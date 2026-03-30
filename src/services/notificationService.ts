/**
 * V3.0 — Notification Service
 * Creates notifications, checks user preferences, pushes via SSE.
 * Codes are loaded from DB (notification_codes table) — admin-manageable.
 */
import { query } from '../utils/db';
import { NotificationCode } from '../constants/notificationCodes';
import { Response } from 'express';

// ─── SSE Connections ─────────────────────────────────────────────────
// Map of userId → Set of SSE response objects
const sseClients = new Map<string, Set<Response>>();

export function addSSEClient(userId: string, res: Response): void {
    if (!sseClients.has(userId)) sseClients.set(userId, new Set());
    sseClients.get(userId)!.add(res);
}

export function removeSSEClient(userId: string, res: Response): void {
    sseClients.get(userId)?.delete(res);
    if (sseClients.get(userId)?.size === 0) sseClients.delete(userId);
}

function pushToUser(userId: string, data: any): void {
    const clients = sseClients.get(userId);
    if (!clients) return;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
        try { res.write(payload); } catch { clients.delete(res); }
    }
}

// ─── Create Notification ─────────────────────────────────────────────

interface NotifyOptions {
    userId: string;
    code: NotificationCode;
    message?: string;
    link?: string;
    metadata?: Record<string, any>;
}

export async function notify(opts: NotifyOptions): Promise<void> {
    const { userId, code, message, link, metadata } = opts;

    try {
        // Fetch code definition from DB
        const { rows: codeDefs } = await query(
            'SELECT title, category, severity, default_in_app, default_email, is_active FROM notification_codes WHERE code = $1',
            [code]
        );

        const codeDef = codeDefs[0];
        if (!codeDef || !codeDef.is_active) return; // Code disabled by admin

        const severity = codeDef.severity || 'info';
        const title = message ? codeDef.title : codeDef.title; // Use DB title
        const type = codeDef.category || code.split('_').slice(1, -1).join('_').toLowerCase();

        // Check user preferences — fallback to code defaults
        const { rows: prefs } = await query(
            'SELECT in_app, email FROM notification_preferences WHERE "userId" = $1 AND code = $2',
            [userId, code]
        );

        const inApp = prefs.length === 0 ? codeDef.default_in_app : prefs[0].in_app;
        const sendEmail = prefs.length === 0 ? codeDef.default_email : prefs[0].email;

        // Create in-app notification
        if (inApp) {
            const { rows } = await query(
                `INSERT INTO notifications ("userId", code, type, severity, title, message, link, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [userId, code, type, severity, title, message || null, link || null, metadata ? JSON.stringify(metadata) : '{}']
            );

            // Push via SSE immediately
            pushToUser(userId, {
                type: 'notification',
                notification: rows[0],
            });
        }

        // Send email for critical events (or if user opted in)
        if (sendEmail) {
            // Queue email — don't block the notification flow
            queueNotificationEmail(userId, code, title, message || '').catch(() => {});
        }
    } catch (err) {
        console.error(`[NotificationService] Failed to create notification ${code} for user ${userId}:`, err);
    }
}

// ─── Bulk notify (same event to multiple users) ──────────────────────

export async function notifyMany(userIds: string[], code: NotificationCode, message?: string, link?: string, metadata?: Record<string, any>): Promise<void> {
    for (const userId of userIds) {
        notify({ userId, code, message, link, metadata });
    }
}

// ─── Get unread count ────────────────────────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
    const { rows } = await query(
        'SELECT COUNT(*) FROM notifications WHERE "userId" = $1 AND read = false',
        [userId]
    );
    return parseInt(rows[0].count, 10);
}

// ─── Email queueing (simple — replace with jobQueue for production) ──

async function queueNotificationEmail(userId: string, code: string, title: string, message: string): Promise<void> {
    try {
        const { rows } = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
        if (rows.length === 0) return;

        const { sendEmail: send } = await import('../utils/email');
        await send(rows[0].email, `[DevManus] ${title}`, `
            <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="display: inline-block; width: 40px; height: 40px; background: #249d9f; border-radius: 10px; line-height: 40px; text-align: center; color: white; font-weight: bold; font-size: 18px;">D</div>
                </div>
                <h2 style="color: #E6EDF3; font-size: 20px; margin: 0 0 8px;">${title}</h2>
                <p style="color: #8B949E; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${message}</p>
                <p style="color: #6E7681; font-size: 11px; margin-top: 32px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px;">
                    Code: ${code} · DevManus API Documentation Platform
                </p>
            </div>
        `);
    } catch {
        // Silent fail — email is best-effort
    }
}
