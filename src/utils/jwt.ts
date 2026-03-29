import jwt, { JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from './db';

// Fail hard if JWT_SECRET is missing or weak
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
    if (process.env.NODE_ENV === 'test') {
        // Allow weak secrets in test mode
    } else {
        console.error('FATAL: JWT_SECRET must be set with at least 16 characters');
        process.exit(1);
    }
}

const SECRET = JWT_SECRET || 'test-secret-for-testing-only';

export interface UserPayload extends JwtPayload {
    userId: string;
    type?: 'access' | 'refresh';
}

// ─── Access Token (short-lived: 15 minutes) ─────────────────────────

export const signAccessToken = (payload: { userId: string }) => {
    return jwt.sign({ ...payload, type: 'access' }, SECRET, {
        expiresIn: '15m',
        issuer: 'devmanus-api',
    });
};

// ─── Backward compat alias ──────────────────────────────────────────
export const signJwt = signAccessToken;

export const verifyJwt = (token: string): UserPayload | null => {
    try {
        const decoded = jwt.verify(token, SECRET);
        if (typeof decoded === 'string') return null;
        return decoded as UserPayload;
    } catch {
        return null;
    }
};

// ─── Refresh Token (long-lived: 7 days, stored in DB) ───────────────

export async function createRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
        'INSERT INTO refresh_tokens ("userId", token, "expiresAt") VALUES ($1, $2, $3)',
        [userId, token, expiresAt]
    );

    return token;
}

export async function verifyRefreshToken(token: string): Promise<string | null> {
    const { rows } = await query(
        'SELECT "userId" FROM refresh_tokens WHERE token = $1 AND revoked = false AND "expiresAt" > NOW()',
        [token]
    );
    if (rows.length === 0) return null;
    return rows[0].userId;
}

export async function revokeRefreshToken(token: string): Promise<void> {
    await query('UPDATE refresh_tokens SET revoked = true WHERE token = $1', [token]);
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
    await query('UPDATE refresh_tokens SET revoked = true WHERE "userId" = $1', [userId]);
}

// ─── Password Validation ────────────────────────────────────────────

export const PASSWORD_RULES = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
};

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < PASSWORD_RULES.minLength) {
        errors.push(`Must be at least ${PASSWORD_RULES.minLength} characters`);
    }
    if (PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Must contain at least one uppercase letter');
    }
    if (PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Must contain at least one lowercase letter');
    }
    if (PASSWORD_RULES.requireNumber && !/[0-9]/.test(password)) {
        errors.push('Must contain at least one number');
    }
    if (PASSWORD_RULES.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
        errors.push('Must contain at least one special character');
    }

    return { valid: errors.length === 0, errors };
}

// ─── Account Lockout ────────────────────────────────────────────────

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MIN = 15;

export async function recordFailedLogin(userId: string): Promise<{ locked: boolean; attemptsLeft: number }> {
    const { rows } = await query(
        'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1 RETURNING failed_login_attempts',
        [userId]
    );
    const attempts = rows[0]?.failed_login_attempts || 0;

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MIN * 60 * 1000);
        await query('UPDATE users SET locked_until = $1 WHERE id = $2', [lockedUntil, userId]);
        return { locked: true, attemptsLeft: 0 };
    }

    return { locked: false, attemptsLeft: MAX_LOGIN_ATTEMPTS - attempts };
}

export async function resetLoginAttempts(userId: string): Promise<void> {
    await query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [userId]);
}

export async function isAccountLocked(userId: string): Promise<boolean> {
    const { rows } = await query(
        'SELECT locked_until FROM users WHERE id = $1',
        [userId]
    );
    if (!rows[0]?.locked_until) return false;
    if (new Date(rows[0].locked_until) > new Date()) return true;
    // Lock expired, reset
    await resetLoginAttempts(userId);
    return false;
}
