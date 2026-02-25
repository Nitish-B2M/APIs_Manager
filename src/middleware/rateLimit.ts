import rateLimit from 'express-rate-limit';

// General rate limiter: 100 requests per 15 minutes
export const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: 'Too many requests, please try again later.' },
});

// Auth rate limiter: 20 requests per 15 minutes (stricter for login/register)
export const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: 'Too many authentication attempts, please try again later.' },
});

// Password reset limiter: 13 requests per hour
export const resetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 13,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: 'Too many password reset attempts, please try again later.' },
});
