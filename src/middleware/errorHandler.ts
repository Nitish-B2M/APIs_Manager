import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
}

export const errorHandler = (err: AppError, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    const message = err.isOperational ? err.message : 'Internal server error';

    console.error(`[ERROR] ${statusCode} - ${err.message}`, {
        stack: err.stack,
        timestamp: new Date().toISOString(),
    });

    res.status(statusCode).json({
        status: false,
        message,
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
