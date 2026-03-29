import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async Express route handler or middleware.
 * If the promise is rejected, it passes the error to the next() function,
 * ensuring the global error handler catches it and returns a JSON response
 * rather than allowing the Node process to return an unhandled HTML 500 block.
 */
export const catchAsync = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any> | void) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch((err) => next(err));
    };
};
