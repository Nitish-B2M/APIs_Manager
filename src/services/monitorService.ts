import * as cron from 'node-cron';
import axios from 'axios';
import { query } from '../utils/db';

// Map of active cron jobs: monitorId -> cron.ScheduledTask
const activeJobs = new Map<string, cron.ScheduledTask>();

// Frequency label -> cron expression
const FREQ_TO_CRON: Record<string, string> = {
    '1min': '* * * * *',
    '5min': '*/5 * * * *',
    '15min': '*/15 * * * *',
    '30min': '*/30 * * * *',
    '1hr': '0 * * * *',
    '6hr': '0 */6 * * *',
    '24hr': '0 0 * * *',
};

export async function initMonitors() {
    console.log('[Monitor] Initializing scheduled monitors...');
    try {
        const result = await query('SELECT * FROM monitors WHERE "isActive" = true');
        for (const monitor of result.rows) {
            scheduleMonitor(monitor);
        }
        console.log(`[Monitor] ${result.rows.length} monitor(s) started.`);
    } catch (err) {
        console.error('[Monitor] Failed to initialize monitors:', err);
    }
}

export function scheduleMonitor(monitor: any) {
    const cronExpr = FREQ_TO_CRON[monitor.frequency] || FREQ_TO_CRON['5min'];
    stopMonitor(monitor.id);
    const job = cron.schedule(cronExpr, () => runMonitorCheck(monitor.id), {
        timezone: 'UTC',
    });
    activeJobs.set(monitor.id, job);
    console.log(`[Monitor] Scheduled: "${monitor.name}" (${monitor.frequency})`);
}

export function stopMonitor(monitorId: string) {
    const existing = activeJobs.get(monitorId);
    if (existing) {
        existing.stop();
        activeJobs.delete(monitorId);
    }
}

export async function runMonitorCheck(monitorId: string): Promise<void> {
    let monitor: any;
    try {
        const res = await query('SELECT * FROM monitors WHERE id = $1', [monitorId]);
        if (res.rows.length === 0) return;
        monitor = res.rows[0];
    } catch (err) {
        console.error(`[Monitor] Could not fetch monitor ${monitorId}:`, err);
        return;
    }

    const start = Date.now();
    let statusCode: number | null = null;
    let isSuccess = false;
    let errorMessage: string | null = null;

    try {
        const headers: Record<string, string> = {};
        if (Array.isArray(monitor.headers)) {
            for (const h of monitor.headers) {
                if (h.key && h.value) headers[h.key] = h.value;
            }
        }
        const response = await axios({
            method: monitor.method || 'GET',
            url: monitor.url,
            headers,
            data: monitor.body || undefined,
            timeout: 30000,
            validateStatus: () => true,
        });
        statusCode = response.status;
        isSuccess = response.status >= 200 && response.status < 400;
    } catch (err: any) {
        errorMessage = err.message || 'Request failed';
        isSuccess = false;
    }

    const responseTime = Date.now() - start;

    try {
        await query(
            `INSERT INTO monitor_results ("monitorId", "statusCode", "responseTime", "isSuccess", error, "checkedAt")
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [monitorId, statusCode, responseTime, isSuccess, errorMessage]
        );
    } catch (err) {
        console.error(`[Monitor] Failed to save result for ${monitorId}:`, err);
    }

    if (!isSuccess) {
        if (monitor.notifyEmail) {
            console.log(`[Monitor] ALERT: Monitor "${monitor.name}" failed. Notify: ${monitor.notifyEmail}`);
        }
        if (monitor.webhookUrl) {
            await sendWebhookNotification(monitor, {
                statusCode,
                responseTime,
                errorMessage,
                checkedAt: new Date()
            });
        }
    }
    console.log(`[Monitor] Check: "${monitor.name}" -> ${isSuccess ? '✅' : '❌'} ${statusCode ?? 'ERR'} (${responseTime}ms)`);
}

async function sendWebhookNotification(monitor: any, result: any) {
    const { webhookUrl, webhookType, name, url } = monitor;
    console.log(`[Monitor] Sending ${webhookType} webhook alert to ${webhookUrl}`);

    try {
        if (webhookType === 'slack') {
            await axios.post(webhookUrl, {
                blocks: [
                    {
                        type: "header",
                        text: {
                            type: "plain_text",
                            text: "🚨 Monitor Alert: Request Failed",
                            emoji: true
                        }
                    },
                    {
                        type: "section",
                        fields: [
                            { type: "mrkdwn", text: `*Monitor Name:*\n${name}` },
                            { type: "mrkdwn", text: `*Target URL:*\n${url}` }
                        ]
                    },
                    {
                        type: "section",
                        fields: [
                            { type: "mrkdwn", text: `*Status Code:*\n${result.statusCode ?? 'ERR'}` },
                            { type: "mrkdwn", text: `*Response Time:*\n${result.responseTime}ms` }
                        ]
                    },
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*Error:*\n\`${result.errorMessage || 'Unknown error'}\``
                        }
                    },
                    {
                        type: "context",
                        elements: [
                            { type: "mrkdwn", text: `Checked at: ${result.checkedAt.toISOString()}` }
                        ]
                    }
                ]
            });
        } else {
            // Generic Webhook
            await axios.post(webhookUrl, {
                event: 'monitor.failure',
                monitor: { id: monitor.id, name, url, method: monitor.method },
                result: {
                    statusCode: result.statusCode,
                    responseTime: result.responseTime,
                    error: result.errorMessage,
                    checkedAt: result.checkedAt
                }
            });
        }
    } catch (err: any) {
        console.error(`[Monitor] Failed to send webhook for ${monitor.id}:`, err.message);
    }
}

export async function createMonitor(data: {
    documentationId: string;
    requestId?: string;
    name: string;
    url: string;
    method: string;
    headers?: any[];
    body?: string;
    frequency: string;
    notifyEmail?: string;
    webhookUrl?: string;
    webhookType?: string;
}) {
    const result = await query(
        `INSERT INTO monitors ("documentationId", "requestId", name, url, method, headers, body, frequency, "notifyEmail", "webhookUrl", "webhookType")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
            data.documentationId,
            data.requestId || null,
            data.name,
            data.url,
            data.method || 'GET',
            JSON.stringify(data.headers || []),
            data.body || null,
            data.frequency || '5min',
            data.notifyEmail || null,
            data.webhookUrl || null,
            data.webhookType || 'generic'
        ]
    );
    const monitor = result.rows[0];
    scheduleMonitor(monitor);
    return monitor;
}

export async function listMonitors(documentationId: string) {
    const result = await query(
        `SELECT m.*,
            COUNT(r.id) AS "totalChecks",
            SUM(CASE WHEN r."isSuccess" THEN 1 ELSE 0 END) AS "successCount",
            ROUND(AVG(r."responseTime")) AS "avgResponseTime",
            MAX(r."checkedAt") AS "lastCheckedAt",
            (SELECT r2."isSuccess" FROM monitor_results r2 WHERE r2."monitorId" = m.id ORDER BY r2."checkedAt" DESC LIMIT 1) AS "lastStatus"
         FROM monitors m
         LEFT JOIN monitor_results r ON r."monitorId" = m.id
         WHERE m."documentationId" = $1
         GROUP BY m.id
         ORDER BY m."createdAt" DESC`,
        [documentationId]
    );
    return result.rows;
}

export async function getMonitorHistory(monitorId: string, limit = 100) {
    const result = await query(
        `SELECT * FROM monitor_results WHERE "monitorId" = $1 ORDER BY "checkedAt" DESC LIMIT $2`,
        [monitorId, limit]
    );
    return result.rows.reverse();
}

export async function updateMonitor(monitorId: string, data: Partial<{
    name: string; url: string; method: string; headers: any[];
    body: string; frequency: string; isActive: boolean; notifyEmail: string;
    webhookUrl: string; webhookType: string;
}>) {
    const result = await query(
        `UPDATE monitors SET
            name = COALESCE($1, name),
            url = COALESCE($2, url),
            method = COALESCE($3, method),
            headers = COALESCE($4, headers),
            body = COALESCE($5, body),
            frequency = COALESCE($6, frequency),
            "isActive" = COALESCE($7, "isActive"),
            "notifyEmail" = COALESCE($8, "notifyEmail"),
            "webhookUrl" = COALESCE($9, "webhookUrl"),
            "webhookType" = COALESCE($10, "webhookType"),
            "updatedAt" = NOW()
         WHERE id = $11 RETURNING *`,
        [
            data.name, data.url, data.method,
            data.headers ? JSON.stringify(data.headers) : null,
            data.body, data.frequency, data.isActive, data.notifyEmail,
            data.webhookUrl, data.webhookType,
            monitorId
        ]
    );
    const monitor = result.rows[0];
    if (monitor) {
        if (monitor.isActive) scheduleMonitor(monitor);
        else stopMonitor(monitorId);
    }
    return monitor;
}

export async function deleteMonitor(monitorId: string) {
    stopMonitor(monitorId);
    await query('DELETE FROM monitors WHERE id = $1', [monitorId]);
}

export async function triggerManualCheck(monitorId: string) {
    await runMonitorCheck(monitorId);
    const history = await getMonitorHistory(monitorId, 1);
    return history[0];
}
