import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest } from './auth';

interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
}

/**
 * Request ID middleware — attaches a unique ID to every request for tracing.
 */
export const requestIdMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
};

/**
 * Global error handler — must be the LAST middleware.
 * Never leaks internal error details in production.
 */
export const errorHandler = (err: AppError, req: AuthRequest, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    const requestId = req.requestId || 'unknown';

    // Always log the full error server-side
    console.error(`[ERROR] ${statusCode} [${requestId}] ${err.message}`, {
        stack: err.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
    });

    // In production, only return operational error messages
    const message = err.isOperational
        ? err.message
        : (process.env.NODE_ENV === 'development' ? err.message : 'Internal server error');

    res.status(statusCode).json({
        status: false,
        message,
        requestId,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

// Helper to create operational errors
export class ApiError extends Error {
    statusCode: number;
    isOperational: boolean;

    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
