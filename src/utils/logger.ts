/**
 * Structured Logger — JSON output for production, pretty for development.
 * Compatible with log aggregators (ELK, Datadog, CloudWatch).
 * Keeps the existing listener pattern for admin SSE streaming.
 * Persists errors to the error_logs DB table.
 */

import { query } from './db';

export interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    data?: any;
    requestId?: string;
    service?: string;
    duration?: number;
}

export interface ErrorLogContext {
    requestId?: string;
    userId?: string;
    method?: string;
    path?: string;
    body?: any;
    headers?: any;
    statusCode?: number;
    responseTime?: number;
    ipAddress?: string;
    userAgent?: string;
}

const listeners = new Set<(log: LogEntry) => void>();
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

// Fields to redact from request bodies and headers
const SENSITIVE_BODY_FIELDS = new Set([
    'password', 'newPassword', 'oldPassword', 'confirmPassword',
    'token', 'refreshToken', 'accessToken', 'secret', 'apiKey',
    'creditCard', 'ssn', 'cvv',
]);
const SENSITIVE_HEADER_FIELDS = new Set([
    'authorization', 'cookie', 'x-api-key', 'x-auth-token',
]);

/**
 * Redact sensitive fields from an object (shallow).
 */
function sanitize(obj: any, sensitiveKeys: Set<string>): any {
    if (!obj || typeof obj !== 'object') return obj;
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.has(key.toLowerCase())) {
            result[key] = '[REDACTED]';
        } else {
            result[key] = value;
        }
    }
    return result;
}

export function addLogListener(listener: (log: LogEntry) => void) {
    listeners.add(listener);
}

export function removeLogListener(listener: (log: LogEntry) => void) {
    listeners.delete(listener);
}

export function log(level: LogEntry['level'], message: string, data?: any, extra?: Partial<LogEntry>) {
    if (LEVELS[level] < LEVELS[logLevel]) return;

    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        data,
        ...extra,
    };

    // Output
    if (isProduction) {
        const output = JSON.stringify({
            time: entry.timestamp,
            level: entry.level,
            msg: entry.message,
            ...(entry.requestId ? { requestId: entry.requestId } : {}),
            ...(entry.service ? { service: entry.service } : {}),
            ...(entry.duration !== undefined ? { duration: entry.duration } : {}),
            ...(entry.data ? { data: entry.data } : {}),
        });
        if (level === 'error') process.stderr.write(output + '\n');
        else process.stdout.write(output + '\n');
    } else {
        const prefix = `[${entry.timestamp.substring(11, 23)}] [${level.toUpperCase().padEnd(5)}]`;
        const svc = entry.service ? ` [${entry.service}]` : '';
        const rid = entry.requestId ? ` (${entry.requestId.substring(0, 8)})` : '';
        const dur = entry.duration !== undefined ? ` ${entry.duration}ms` : '';
        const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[consoleMethod](`${prefix}${svc}${rid} ${message}${dur}`, data || '');
    }

    // Notify SSE listeners (admin dashboard)
    listeners.forEach(listener => {
        try { listener(entry); } catch { /* don't crash on listener errors */ }
    });
}

/**
 * Log a structured error report and persist to DB.
 */
export function logErrorReport(
    functionName: string,
    serviceName: string,
    error: unknown,
    errorCode: string,
    context?: ErrorLogContext
): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Console/structured log
    log('error', `${serviceName}.${functionName}: ${errorMessage}`, {
        errorCode,
        stack: errorStack,
    }, { service: serviceName, requestId: context?.requestId });

    // Persist to error_logs table (fire-and-forget)
    persistErrorLog({
        level: 'error',
        service: serviceName,
        function: functionName,
        errorCode,
        message: errorMessage,
        stack: errorStack,
        ...context,
    }).catch(() => { /* never crash on log persistence failure */ });
}

/**
 * Persist an error entry to the error_logs table.
 */
async function persistErrorLog(entry: {
    level: string;
    service: string;
    function?: string;
    errorCode?: string;
    message: string;
    stack?: string;
    requestId?: string;
    userId?: string;
    method?: string;
    path?: string;
    body?: any;
    headers?: any;
    statusCode?: number;
    responseTime?: number;
    ipAddress?: string;
    userAgent?: string;
}): Promise<void> {
    const sanitizedBody = entry.body ? sanitize(entry.body, SENSITIVE_BODY_FIELDS) : null;
    const sanitizedHeaders = entry.headers ? sanitize(entry.headers, SENSITIVE_HEADER_FIELDS) : null;

    await query(
        `INSERT INTO error_logs
            (level, service, function, error_code, message, stack,
             request_id, user_id, method, path, body, headers,
             status_code, response_time, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
            entry.level,
            entry.service,
            entry.function || null,
            entry.errorCode || null,
            entry.message,
            entry.stack || null,
            entry.requestId || null,
            entry.userId || null,
            entry.method || null,
            entry.path || null,
            sanitizedBody ? JSON.stringify(sanitizedBody) : null,
            sanitizedHeaders ? JSON.stringify(sanitizedHeaders) : null,
            entry.statusCode || null,
            entry.responseTime || null,
            entry.ipAddress || null,
            entry.userAgent || null,
        ]
    );
}

/**
 * Request logger middleware — logs each request with timing.
 */
export function requestLogger() {
    return (req: any, res: any, next: any) => {
        const start = Date.now();
        const originalEnd = res.end.bind(res);

        res.end = (...args: any[]) => {
            const duration = Date.now() - start;
            log('info', `${req.method} ${req.url} ${res.statusCode}`, undefined, {
                requestId: req.requestId,
                duration,
            });
            return originalEnd(...args);
        };

        next();
    };
}
