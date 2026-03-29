import rateLimit from 'express-rate-limit';
import { AuthRequest } from './auth';

/**
 * Key generator: use userId if authenticated, else IP.
 * This prevents a single user from consuming the entire IP budget.
 */
const keyGenerator = (req: AuthRequest): string => {
    return req.user?.userId || req.ip || 'unknown';
};

// General rate limiter: 100 requests per minute per user/IP
export const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    message: { status: false, message: 'Too many requests, please try again later.' },
});

// Auth rate limiter: 10 requests per 15 minutes per IP (stricter for login/register)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: 'Too many authentication attempts, please try again later.' },
});

// Password reset limiter: 5 requests per hour per IP
export const resetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: 'Too many password reset attempts, please try again later.' },
});

// Sensitive operations limiter: 30 requests per minute per user
export const sensitiveLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    message: { status: false, message: 'Too many requests for this operation.' },
});
