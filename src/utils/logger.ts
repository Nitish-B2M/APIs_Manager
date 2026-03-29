/**
 * Structured Logger — JSON output for production, pretty for development.
 * Compatible with log aggregators (ELK, Datadog, CloudWatch).
 * Keeps the existing listener pattern for admin SSE streaming.
 */

export interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    data?: any;
    requestId?: string;
    service?: string;
    duration?: number;
}

const listeners = new Set<(log: LogEntry) => void>();
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function addLogListener(listener: (log: LogEntry) => void) {
    listeners.add(listener);
}

export function removeLogListener(listener: (log: LogEntry) => void) {
    listeners.delete(listener);
}

export function log(level: LogEntry['level'], message: string, data?: any, extra?: Partial<LogEntry>) {
    // Skip if below configured level
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
        // Structured JSON for log aggregators
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
        // Pretty console for development
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
 * Log a structured error report.
 */
export function logErrorReport(
    functionName: string,
    serviceName: string,
    error: unknown,
    errorCode: string
): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    log('error', `${serviceName}.${functionName}: ${errorMessage}`, {
        errorCode,
        stack: errorStack,
    }, { service: serviceName });
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
