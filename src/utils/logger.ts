// ============================================
// Error Logging Utility
// For now: console.log structured output
// ============================================

/**
 * Log a structured error report to the console.
 *
 * @param functionName - Name of the function where the error occurred (e.g. 'listDocumentations')
 * @param serviceName  - Name of the service/module (e.g. 'DocumentationService')
 * @param error        - The caught error object
 * @param errorCode    - Constant error code from constants/errorCodes.ts (e.g. 'DOC_001')
 */
export function logErrorReport(
    functionName: string,
    serviceName: string,
    error: unknown,
    errorCode: string
): void {
    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.log(`[ERROR_REPORT]`, {
        timestamp,
        errorCode,
        serviceName,
        functionName,
        message: errorMessage,
        ...(errorStack && { stack: errorStack }),
    });
}
