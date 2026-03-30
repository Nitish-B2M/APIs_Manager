import { Router, Response, Request } from 'express';
import { query } from '../utils/db';
import {
    signAccessToken, createRefreshToken, verifyRefreshToken, revokeRefreshToken,
    revokeAllUserTokens, validatePassword, recordFailedLogin, resetLoginAttempts, isAccountLocked
} from '../utils/jwt';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';
import { sendBrandedEmail } from '../utils/email';
import { resetLimiter, authLimiter } from '../middleware/rateLimit';
import { catchAsync } from '../utils/catchAsync';
import { notify } from '../services/notificationService';
import { NOTIFY } from '../constants/notificationCodes';

const SERVICE_NAME = 'AuthService';
const router = Router();

// ─── Shared Zod schemas ─────────────────────────────────────────────

const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: passwordSchema,
    inviteToken: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
});

// ─── Helper: set refresh token cookie ───────────────────────────────

function setRefreshCookie(res: Response, token: string) {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/auth',
    });
}

// ─── POST /register ─────────────────────────────────────────────────

router.post('/register', authLimiter, catchAsync(async (req: Request, res: Response) => {
    try {
        const { email, password, inviteToken } = registerSchema.parse(req.body);

        // Validate password strength
        const pwCheck = validatePassword(password);
        if (!pwCheck.valid) {
            res.status(400).json(ApiResponse.error({ message: `Weak password: ${pwCheck.errors.join(', ')}` }));
            return;
        }

        const { rows: existingUsers } = await query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUsers.length > 0) {
            res.status(409).json(ApiResponse.error({ message: 'User already exists' }));
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        // Generate email verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

        await query('BEGIN');
        try {
            const { rows } = await query(
                `INSERT INTO users (email, password, email_verified, verification_token, verification_token_expires)
                 VALUES ($1, $2, false, $3, $4) RETURNING *`,
                [email, hashedPassword, verificationToken, verificationExpires]
            );
            const user = rows[0];

            // Handle invitations
            if (inviteToken) {
                const { rows: invites } = await query(
                    'SELECT * FROM invitations WHERE token = $1 AND email = $2 AND "expiresAt" > NOW()',
                    [inviteToken, email]
                );
                if (invites.length > 0) {
                    const invite = invites[0];
                    await query(
                        'INSERT INTO documentation_collaborators ("documentationId", "userId", role) VALUES ($1, $2, $3)',
                        [invite.documentationId, user.id, invite.role]
                    );
                    await query('DELETE FROM invitations WHERE id = $1', [invite.id]);
                }
            } else {
                const { rows: invites } = await query(
                    'SELECT * FROM invitations WHERE email = $1 AND "expiresAt" > NOW()',
                    [email]
                );
                for (const invite of invites) {
                    await query(
                        'INSERT INTO documentation_collaborators ("documentationId", "userId", role) VALUES ($1, $2, $3)',
                        [invite.documentationId, user.id, invite.role]
                    );
                    await query('DELETE FROM invitations WHERE id = $1', [invite.id]);
                }
            }

            await query('COMMIT');

            // Send branded welcome + verification email
            const clientUrl = process.env.ALLOWED_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:3000';
            const verifyLink = `${clientUrl}/verify-email?token=${verificationToken}`;
            sendBrandedEmail(email, 'WELCOME', {
                userName: email.split('@')[0],
                verifyLink,
                expiresIn: '24 hours',
            }).catch(err => console.error('[Email] Welcome send failed:', err.message));

            // Issue tokens
            const accessToken = signAccessToken({ userId: user.id });
            const refreshToken = await createRefreshToken(user.id);
            setRefreshCookie(res, refreshToken);

            // Notify: welcome
            notify({ userId: user.id, code: NOTIFY.USER_REGISTERED, message: `Welcome to DevManus! Verify your email to unlock all features.`, link: '/dashboard' });

            res.json(ApiResponse.success({
                message: 'User registered successfully. Please verify your email.',
                data: { token: accessToken, user: { id: user.id, email: user.email, isAdmin: user.is_admin, emailVerified: false } },
            }));
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error: any) {
        if (error.name === 'ZodError') {
            res.status(400).json(ApiResponse.error({ message: error.errors?.[0]?.message || 'Validation failed' }));
            return;
        }
        logErrorReport('register', SERVICE_NAME, error, ERROR_CODES.AUTH_REGISTER_FAILED);
        res.status(400).json(ApiResponse.error({ message: 'Registration failed' }));
    }
}));

// ─── POST /login ────────────────────────────────────────────────────

router.post('/login', authLimiter, catchAsync(async (req: Request, res: Response) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
        const user = rows[0];

        if (!user) {
            // Same error message whether user exists or not (prevents enumeration)
            res.status(401).json(ApiResponse.error({ message: 'Invalid email or password' }));
            return;
        }

        // Check account lockout
        if (await isAccountLocked(user.id)) {
            res.status(423).json(ApiResponse.error({ message: 'Account is temporarily locked due to too many failed attempts. Try again in 15 minutes.' }));
            return;
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            const lockResult = await recordFailedLogin(user.id);
            if (lockResult.locked) {
                notify({ userId: user.id, code: NOTIFY.USER_ACCOUNT_LOCKED, message: 'Your account has been locked for 15 minutes due to too many failed login attempts.' });
                res.status(423).json(ApiResponse.error({ message: 'Account locked due to too many failed attempts. Try again in 15 minutes.' }));
            } else {
                res.status(401).json(ApiResponse.error({ message: 'Invalid email or password' }));
            }
            return;
        }

        // Successful login — reset failed attempts
        await resetLoginAttempts(user.id);

        // Consume pending invitations
        try {
            await query('BEGIN');
            const { rows: invites } = await query(
                'SELECT * FROM invitations WHERE email = $1 AND "expiresAt" > NOW()',
                [user.email]
            );
            for (const invite of invites) {
                await query(
                    'INSERT INTO documentation_collaborators ("documentationId", "userId", role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                    [invite.documentationId, user.id, invite.role]
                );
                await query('DELETE FROM invitations WHERE id = $1', [invite.id]);
            }
            await query('COMMIT');
        } catch {
            await query('ROLLBACK');
        }

        const accessToken = signAccessToken({ userId: user.id });
        const refreshToken = await createRefreshToken(user.id);
        setRefreshCookie(res, refreshToken);

        res.json(ApiResponse.success({
            message: 'Login successful',
            data: { token: accessToken, user: { id: user.id, email: user.email, isAdmin: user.is_admin, emailVerified: user.email_verified } },
        }));
    } catch (error: any) {
        if (error.name === 'ZodError') {
            res.status(400).json(ApiResponse.error({ message: 'Invalid input' }));
            return;
        }
        logErrorReport('login', SERVICE_NAME, error, ERROR_CODES.AUTH_LOGIN_FAILED);
        res.status(400).json(ApiResponse.error({ message: 'Login failed' }));
    }
}));

// ─── POST /refresh ──────────────────────────────────────────────────
// Rotate the refresh token and issue a new access token

router.post('/refresh', catchAsync(async (req: Request, res: Response) => {
    const oldToken = req.cookies?.refreshToken;
    if (!oldToken) {
        res.status(401).json(ApiResponse.error({ message: 'No refresh token' }));
        return;
    }

    const userId = await verifyRefreshToken(oldToken);
    if (!userId) {
        res.status(401).json(ApiResponse.error({ message: 'Invalid or expired refresh token' }));
        return;
    }

    // Revoke old token and issue new pair (rotation)
    await revokeRefreshToken(oldToken);
    const accessToken = signAccessToken({ userId });
    const newRefreshToken = await createRefreshToken(userId);
    setRefreshCookie(res, newRefreshToken);

    res.json(ApiResponse.success({
        message: 'Token refreshed',
        data: { token: accessToken },
    }));
}));

// ─── POST /logout ───────────────────────────────────────────────────

router.post('/logout', catchAsync(async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
        await revokeRefreshToken(refreshToken);
    }
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json(ApiResponse.success({ message: 'Logged out' }));
}));

// ─── POST /verify-email ─────────────────────────────────────────────

router.post('/verify-email', catchAsync(async (req: Request, res: Response) => {
    const schema = z.object({ token: z.string().min(1) });
    const { token } = schema.parse(req.body);

    const { rows } = await query(
        'SELECT id FROM users WHERE verification_token = $1 AND verification_token_expires > NOW() AND email_verified = false',
        [token]
    );

    if (rows.length === 0) {
        res.status(400).json(ApiResponse.error({ message: 'Invalid or expired verification token' }));
        return;
    }

    await query(
        'UPDATE users SET email_verified = true, verification_token = NULL, verification_token_expires = NULL WHERE id = $1',
        [rows[0].id]
    );

    notify({ userId: rows[0].id, code: NOTIFY.USER_EMAIL_VERIFIED, message: 'Your email has been verified. You now have full access.' });

    res.json(ApiResponse.success({ message: 'Email verified successfully' }));
}));

// ─── POST /resend-verification ──────────────────────────────────────

router.post('/resend-verification', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const { rows } = await query('SELECT id, email, email_verified FROM users WHERE id = $1', [req.user!.userId]);
    const user = rows[0];

    if (!user) {
        res.status(404).json(ApiResponse.error({ message: 'User not found' }));
        return;
    }

    if (user.email_verified) {
        res.json(ApiResponse.success({ message: 'Email already verified' }));
        return;
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await query(
        'UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3',
        [verificationToken, verificationExpires, user.id]
    );

    const clientUrl = process.env.ALLOWED_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:3000';
    const verifyLink = `${clientUrl}/verify-email?token=${verificationToken}`;
    await sendBrandedEmail(user.email, 'EMAIL_VERIFICATION', {
        verifyLink,
        expiresIn: '24 hours',
    });

    res.json(ApiResponse.success({ message: 'Verification email sent' }));
}));

// ─── GET /me ────────────────────────────────────────────────────────

router.get('/me', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user?.userId) {
            res.status(401).json(ApiResponse.error({ message: 'Authentication required' }));
            return;
        }

        const { rows } = await query(
            'SELECT id, email, name, avatar_url, is_admin, settings, email_verified FROM users WHERE id = $1',
            [req.user.userId]
        );

        if (rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'User not found' }));
            return;
        }

        res.json(ApiResponse.success({
            message: 'Profile fetched',
            data: {
                id: rows[0].id,
                email: rows[0].email,
                name: rows[0].name || null,
                avatarUrl: rows[0].avatar_url || null,
                isAdmin: rows[0].is_admin,
                settings: rows[0].settings || {},
                emailVerified: rows[0].email_verified,
            },
        }));
    } catch (error: any) {
        logErrorReport('getProfile', SERVICE_NAME, error, ERROR_CODES.AUTH_PROFILE_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch profile' }));
    }
}));

// ─── PATCH /profile ─────────────────────────────────────────────────

router.patch('/profile', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user?.userId) {
            res.status(401).json(ApiResponse.error({ message: 'Authentication required' }));
            return;
        }

        const schema = z.object({
            name: z.string().max(100).optional(),
            avatarUrl: z.string().url().max(500).optional().nullable(),
            settings: z.record(z.any()).optional(),
        });

        const input = schema.parse(req.body);
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (input.name !== undefined) { fields.push(`name = $${idx}`); values.push(input.name); idx++; }
        if (input.avatarUrl !== undefined) { fields.push(`avatar_url = $${idx}`); values.push(input.avatarUrl); idx++; }
        if (input.settings !== undefined) { fields.push(`settings = $${idx}`); values.push(input.settings); idx++; }

        if (fields.length === 0) {
            res.status(400).json(ApiResponse.error({ message: 'No fields to update' }));
            return;
        }

        fields.push(`"updatedAt" = CURRENT_TIMESTAMP`);
        values.push(req.user.userId);

        const { rows } = await query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, name, avatar_url, settings`,
            values
        );

        res.json(ApiResponse.success({
            message: 'Profile updated successfully',
            data: { id: rows[0].id, email: rows[0].email, name: rows[0].name, avatarUrl: rows[0].avatar_url, settings: rows[0].settings || {} },
        }));
    } catch (error: any) {
        logErrorReport('updateProfile', SERVICE_NAME, error, ERROR_CODES.AUTH_PROFILE_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update profile' }));
    }
}));

// ─── POST /forgot-password ──────────────────────────────────────────

router.post('/forgot-password', resetLimiter, catchAsync(async (req: Request, res: Response) => {
    try {
        const schema = z.object({ email: z.string().email() });
        const { email } = schema.parse(req.body);

        const { rows } = await query('SELECT id, email FROM users WHERE email = $1', [email]);
        const user = rows[0];

        // Always return same message (prevents user enumeration)
        const successMsg = 'If that email exists, we sent a password reset link.';

        if (!user) {
            res.json(ApiResponse.success({ message: successMsg }));
            return;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600 * 1000);

        await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
        await query(
            'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
            [token, user.id, expiresAt]
        );

        const clientUrl = process.env.ALLOWED_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:3000';
        const resetLink = `${clientUrl}/reset-password?token=${token}`;
        await sendBrandedEmail(email, 'PASSWORD_RESET', {
            resetLink,
            expiresIn: '1 hour',
        });

        res.json(ApiResponse.success({ message: successMsg }));
    } catch (error: any) {
        logErrorReport('forgotPassword', SERVICE_NAME, error, ERROR_CODES.AUTH_PASSWORD_RESET_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to process request' }));
    }
}));

// ─── POST /reset-password ───────────────────────────────────────────

router.post('/reset-password', resetLimiter, catchAsync(async (req: Request, res: Response) => {
    try {
        const schema = z.object({ token: z.string(), password: passwordSchema });
        const { token, password } = schema.parse(req.body);

        const pwCheck = validatePassword(password);
        if (!pwCheck.valid) {
            res.status(400).json(ApiResponse.error({ message: `Weak password: ${pwCheck.errors.join(', ')}` }));
            return;
        }

        const { rows: tokenRows } = await query(
            'SELECT * FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()',
            [token]
        );

        if (tokenRows.length === 0) {
            res.status(400).json(ApiResponse.error({ message: 'Invalid or expired token' }));
            return;
        }

        const userId = tokenRows[0].user_id;
        const hashedPassword = await bcrypt.hash(password, 12);
        await query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
        await query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);

        // Revoke all refresh tokens on password change
        await revokeAllUserTokens(userId);

        notify({ userId, code: NOTIFY.USER_PASSWORD_CHANGED, message: 'Your password was changed. If this wasn\'t you, contact support immediately.' });

        res.json(ApiResponse.success({ message: 'Password reset successfully' }));
    } catch (error: any) {
        logErrorReport('resetPassword', SERVICE_NAME, error, ERROR_CODES.AUTH_PASSWORD_RESET_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to reset password' }));
    }
}));

export default router;
