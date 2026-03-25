import axios from 'axios';
import * as crypto from 'crypto';
import { query } from '../utils/db';
import { log } from '../utils/logger';

export interface WebhookEvent {
    event: string;
    documentationId?: string;
    payload: any;
}

export const webhookService = {
    async dispatch(event: WebhookEvent) {
        try {
            // Find all active webhooks subscribed to this event
            // Either global webhooks (documentationId is null) or specific to this collection
            const sql = `
                SELECT * FROM webhooks 
                WHERE "isActive" = true 
                AND ( "documentationId" IS NULL OR "documentationId" = $1 )
                AND events @> $2::jsonb
            `;
            const { rows: webhooks } = await query(sql, [
                event.documentationId || null,
                JSON.stringify([event.event])
            ]);

            for (const webhook of webhooks) {
                this.deliver(webhook, event);
            }
        } catch (err: any) {
            log('error', `[Webhook] Dispatch failed for event ${event.event}`, err.message);
        }
    },

    async deliver(webhook: any, event: WebhookEvent) {
        const timestamp = Date.now();
        const payload = {
            id: crypto.randomUUID(),
            event: event.event,
            documentationId: event.documentationId,
            timestamp: new Date(timestamp).toISOString(),
            data: event.payload
        };

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-DevManus-Event': event.event,
            'X-DevManus-Delivery': payload.id
        };

        if (webhook.secret) {
            const hmac = crypto.createHmac('sha256', webhook.secret);
            const signature = hmac.update(JSON.stringify(payload)).digest('hex');
            headers['X-DevManus-Signature'] = `sha256=${signature}`;
        }

        let statusCode: number | null = null;
        let responseBody: string | null = null;
        let isSuccess = false;

        try {
            const res = await axios.post(webhook.url, payload, { headers, timeout: 10000 });
            statusCode = res.status;
            responseBody = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            isSuccess = res.status >= 200 && res.status < 300;
        } catch (err: any) {
            statusCode = err.response?.status || 0;
            responseBody = err.message;
            isSuccess = false;
        }

        // Log delivery
        try {
            await query(
                `INSERT INTO webhook_logs ("webhookId", event, "statusCode", response, "isSuccess") 
                 VALUES ($1, $2, $3, $4, $5)`,
                [webhook.id, event.event, statusCode, responseBody, isSuccess]
            );
        } catch (logErr) {
            console.error('[Webhook] Failed to log delivery:', logErr);
        }
    }
};
