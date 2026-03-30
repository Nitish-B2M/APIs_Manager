import axios from 'axios';
import * as crypto from 'crypto';
import { query } from '../utils/db';
import { log } from '../utils/logger';
import { notify } from './notificationService';
import { NOTIFY } from '../constants/notificationCodes';

export interface WebhookEvent {
    event: string;
    documentationId?: string;
    payload: any;
}

// Retry delays in ms: 1 min, 5 min, 30 min
const RETRY_DELAYS = [60_000, 300_000, 1_800_000];
const MAX_RETRIES = RETRY_DELAYS.length;

export const webhookService = {
    async dispatch(event: WebhookEvent) {
        try {
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
                // Fire initial delivery (non-blocking)
                this.deliverWithRetry(webhook, event, 0);
            }
        } catch (err: any) {
            log('error', `[Webhook] Dispatch failed for event ${event.event}`, err.message);
        }
    },

    /**
     * Deliver a webhook with exponential backoff retry.
     * attempt=0 is the first try, attempt=1/2/3 are retries.
     */
    async deliverWithRetry(webhook: any, event: WebhookEvent, attempt: number) {
        const result = await this.deliver(webhook, event, attempt);

        if (!result.isSuccess && attempt < MAX_RETRIES) {
            const delay = RETRY_DELAYS[attempt];
            log('warn', `[Webhook] Delivery failed for ${webhook.url}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);

            setTimeout(() => {
                this.deliverWithRetry(webhook, event, attempt + 1);
            }, delay);
        } else if (!result.isSuccess && attempt >= MAX_RETRIES) {
            // Dead letter — all retries exhausted
            log('error', `[Webhook] All ${MAX_RETRIES} retries exhausted for ${webhook.url}. Moving to dead letter.`);
            await this.deadLetter(webhook, event, result.statusCode, result.responseBody);
        }
    },

    /**
     * Single delivery attempt. Returns result for retry decision.
     */
    async deliver(webhook: any, event: WebhookEvent, attempt = 0): Promise<{ isSuccess: boolean; statusCode: number | null; responseBody: string | null }> {
        const deliveryId = crypto.randomUUID();
        const payload = {
            id: deliveryId,
            event: event.event,
            documentationId: event.documentationId,
            timestamp: new Date().toISOString(),
            data: event.payload,
        };

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-DevManus-Event': event.event,
            'X-DevManus-Delivery': deliveryId,
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

        // Log delivery attempt
        try {
            await query(
                `INSERT INTO webhook_logs ("webhookId", event, "statusCode", response, "isSuccess")
                 VALUES ($1, $2, $3, $4, $5)`,
                [webhook.id, `${event.event}${attempt > 0 ? ` (retry ${attempt})` : ''}`, statusCode, responseBody, isSuccess]
            );
        } catch (logErr) {
            console.error('[Webhook] Failed to log delivery:', logErr);
        }

        return { isSuccess, statusCode, responseBody };
    },

    /**
     * Dead letter — store permanently failed deliveries for manual inspection.
     */
    async deadLetter(webhook: any, event: WebhookEvent, statusCode: number | null, lastError: string | null) {
        try {
            await query(
                `INSERT INTO webhook_logs ("webhookId", event, "statusCode", response, "isSuccess")
                 VALUES ($1, $2, $3, $4, false)`,
                [webhook.id, `DEAD_LETTER: ${event.event}`, statusCode, `All ${MAX_RETRIES} retries failed. Last error: ${lastError}`]
            );

            // Notify the documentation owner about dead letter
            if (event.documentationId) {
                const { rows: doc } = await query('SELECT "userId" FROM documentation WHERE id = $1', [event.documentationId]);
                if (doc[0]) {
                    notify({ userId: doc[0].userId, code: NOTIFY.WEBHOOK_DEAD_LETTER, message: `Webhook to ${webhook.url} permanently failed after ${MAX_RETRIES} retries.`, metadata: { webhookId: webhook.id, url: webhook.url, event: event.event } });
                }
            }
        } catch (err) {
            console.error('[Webhook] Failed to write dead letter:', err);
        }
    },
};
