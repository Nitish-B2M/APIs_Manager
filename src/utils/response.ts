// ============================================
// Standardized API Response Helpers
// Returns objects — controller sends via res.json()
// ============================================

interface SuccessResponseOptions {
    message: string;
    data?: any;
    pagination?: any;
}

interface ErrorResponseOptions {
    message: string;
}

export class ApiResponse {
    /**
     * Build a success response object
     * Usage: res.json(ApiResponse.success({ message: '...', data: rows }))
     */
    static success({ message, data = null, pagination = null }: SuccessResponseOptions) {
        return {
            status: true,
            message,
            data,
            pagination,
        };
    }

    /**
     * Build an error response object
     * Usage: res.status(400).json(ApiResponse.error({ message: '...' }))
     * NOTE: Never pass actual error details — only user-friendly messages
     */
    static error({ message }: ErrorResponseOptions) {
        return {
            status: false,
            message,
        };
    }
}
