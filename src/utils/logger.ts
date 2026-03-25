// ============================================
// Error Logging Utility
// For now: console.log structured output
// ============================================

export interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    data?: any;
}

const listeners = new Set<(log: LogEntry) => void>();

export function addLogListener(listener: (log: LogEntry) => void) {
    listeners.add(listener);
}

export function removeLogListener(listener: (log: LogEntry) => void) {
    listeners.delete(listener);
}

export function log(level: LogEntry['level'], message: string, data?: any) {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        data
    };

    // Console output
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](`[${entry.timestamp}] [${level.toUpperCase()}] ${message}`, data || '');

    // Notify listeners
    listeners.forEach(listener => listener(entry));
}

/**
 * Log a structured error report to the console.
...
 */
export function logErrorReport(
    functionName: string,
    serviceName: string,
    error: unknown,
    errorCode: string
): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    log('error', `Error in ${serviceName}.${functionName} (${errorCode}): ${errorMessage}`, {
        errorCode,
        serviceName,
        functionName,
        stack: errorStack
    });
}
