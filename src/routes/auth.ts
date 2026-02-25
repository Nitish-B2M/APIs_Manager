import { Router, Response, Request } from 'express';
import { query } from '../utils/db';
import { signJwt } from '../utils/jwt';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';
import { sendEmail } from '../utils/email';
import crypto from 'crypto';
import { resetLimiter } from '../middleware/rateLimit';

const SERVICE_NAME = 'AuthService';
const router = Router();

router.post('/register', async (req: Request, res: Response) => {
    try {
        const schema = z.object({
            email: z.string().email(),
            password: z.string().min(6),
            inviteToken: z.string().optional()
        });
        const { email, password, inviteToken } = schema.parse(req.body);

        const { rows: existingUsers } = await query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUsers.length > 0) {
            res.status(409).json(ApiResponse.error({ message: 'User already exists' }));
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await query('BEGIN');
        try {
            const { rows } = await query(
                'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *',
                [email, hashedPassword]
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
                // Check for any invitations by email
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

            const token = signJwt({ userId: user.id });
            res.json(ApiResponse.success({
                message: 'User registered successfully',
                data: { token, user: { id: user.id, email: user.email } },
            }));
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error: any) {
        logErrorReport('register', SERVICE_NAME, error, ERROR_CODES.AUTH_REGISTER_FAILED);
        res.status(400).json(ApiResponse.error({ message: 'Registration failed' }));
    }
});

router.post('/login', async (req: Request, res: Response) => {
    try {
        const schema = z.object({ email: z.string().email(), password: z.string() });
        const { email, password } = schema.parse(req.body);

        const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
        const user = rows[0];

        if (!user) {
            res.status(401).json(ApiResponse.error({ message: 'Invalid credentials' }));
            return;
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            res.status(401).json(ApiResponse.error({ message: 'Invalid credentials' }));
            return;
        }

        const token = signJwt({ userId: user.id });

        // Consume invitations for existing users on login
        await query('BEGIN');
        try {
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
        } catch (error) {
            await query('ROLLBACK');
            // Log but don't fail login
            console.error('[Invitation] Failed to consume invitations on login:', error);
        }

        res.json(ApiResponse.success({
            message: 'Login successful',
            data: { token, user: { id: user.id, email: user.email } },
        }));
    } catch (error: any) {
        logErrorReport('login', SERVICE_NAME, error, ERROR_CODES.AUTH_LOGIN_FAILED);
        res.status(400).json(ApiResponse.error({ message: 'Login failed' }));
    }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user?.userId) {
            res.status(401).json(ApiResponse.error({ message: 'Unauthorized' }));
            return;
        }

        const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.userId]);

        if (rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'User not found' }));
            return;
        }

        res.json(ApiResponse.success({
            message: 'Profile fetched',
            data: { id: rows[0].id, email: rows[0].email, name: rows[0].name || null, avatarUrl: rows[0].avatar_url || null },
        }));
    } catch (error: any) {
        logErrorReport('getProfile', SERVICE_NAME, error, ERROR_CODES.AUTH_PROFILE_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch profile' }));
    }
});

// Update profile
router.patch('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user?.userId) {
            res.status(401).json(ApiResponse.error({ message: 'Unauthorized' }));
            return;
        }

        const schema = z.object({
            name: z.string().max(100).optional(),
            avatarUrl: z.string().url().max(500).optional().nullable(),
        });

        const input = schema.parse(req.body);

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (input.name !== undefined) {
            fields.push(`name = $${idx}`);
            values.push(input.name);
            idx++;
        }
        if (input.avatarUrl !== undefined) {
            fields.push(`avatar_url = $${idx}`);
            values.push(input.avatarUrl);
            idx++;
        }

        if (fields.length === 0) {
            res.status(400).json(ApiResponse.error({ message: 'No fields to update' }));
            return;
        }

        fields.push(`"updatedAt" = CURRENT_TIMESTAMP`);
        values.push(req.user.userId);

        const { rows } = await query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, name, avatar_url`,
            values
        );

        res.json(ApiResponse.success({
            message: 'Profile updated successfully',
            data: { id: rows[0].id, email: rows[0].email, name: rows[0].name, avatarUrl: rows[0].avatar_url },
        }));
    } catch (error: any) {
        logErrorReport('updateProfile', SERVICE_NAME, error, ERROR_CODES.AUTH_PROFILE_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to update profile' }));
    }
});

// /forgot-password
router.post('/forgot-password', resetLimiter, async (req: Request, res: Response) => {
    try {
        const schema = z.object({ email: z.string().email() });
        const { email } = schema.parse(req.body);

        const { rows } = await query('SELECT id, email FROM users WHERE email = $1', [email]);
        const user = rows[0];

        if (!user) {
            // For security, do not reveal if user exists
            res.json(ApiResponse.success({ message: 'If that email exists, we sent a password reset link.' }));
            return;
        }

        // Generate token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

        // Clear old tokens for this user
        await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

        // Save new token
        await query(
            'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
            [token, user.id, expiresAt]
        );

        // Send email
        const resetLink = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
        await sendEmail(
            email,
            'Reset Your Password',
            `<p>You requested a password reset. Click the link below to reset your password:</p>
             <p><a href="${resetLink}">Reset Password</a></p>
             <p>This link expires in 1 hour.</p>`
        );

        res.json(ApiResponse.success({ message: 'If that email exists, we sent a password reset link.' }));
    } catch (error: any) {
        logErrorReport('forgotPassword', SERVICE_NAME, error, ERROR_CODES.AUTH_PASSWORD_RESET_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to process request' }));
    }
});

// /reset-password
router.post('/reset-password', resetLimiter, async (req: Request, res: Response) => {
    try {
        const schema = z.object({
            token: z.string(),
            password: z.string().min(6)
        });
        const { token, password } = schema.parse(req.body);

        // Verify token
        const { rows: tokenRows } = await query(
            'SELECT * FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()',
            [token]
        );

        if (tokenRows.length === 0) {
            res.status(400).json(ApiResponse.error({ message: 'Invalid or expired token' }));
            return;
        }

        const userId = tokenRows[0].user_id;

        // Update password
        const hashedPassword = await bcrypt.hash(password, 10);
        await query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedPassword, userId]
        );

        // Delete token
        await query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);

        res.json(ApiResponse.success({ message: 'Password reset successfully' }));
    } catch (error: any) {
        logErrorReport('resetPassword', SERVICE_NAME, error, ERROR_CODES.AUTH_PASSWORD_RESET_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to reset password' }));
    }
});

export default router;
