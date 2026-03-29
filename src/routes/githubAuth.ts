import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';
import { catchAsync } from '../utils/catchAsync';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { encryptToken, decryptToken } from '../utils/crypto';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { updateGitConfig, storeGitCredentials, readGitConfig, readStoredCredentials } from '../utils/gitConfig';

const SERVICE_NAME = 'GitHubAuthService';
const router = Router();

const exchangeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: 'Too many requests, please try again later.' },
});

// In-memory store for pending OAuth states (maps state -> { userId, redirectBack })
const pendingOAuthStates = new Map<string, { userId: string; createdAt: number }>();

// Clean up expired states every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of pendingOAuthStates) {
        if (now - val.createdAt > 10 * 60 * 1000) pendingOAuthStates.delete(key);
    }
}, 10 * 60 * 1000);

// ─── GET /api/auth/github/authorize ──────────────────────────────────
// Initiates the GitHub OAuth flow for the web app.
// Returns the GitHub authorization URL for the frontend to redirect to.
router.get('/authorize', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        res.status(500).json(ApiResponse.error({ message: 'GitHub OAuth is not configured (GITHUB_CLIENT_ID missing)' }));
        return;
    }

    const state = crypto.randomBytes(20).toString('hex');
    pendingOAuthStates.set(state, { userId: req.user!.userId, createdAt: Date.now() });

    const serverUrl = `http://localhost:${process.env.PORT || 4001}`;
    const redirectUri = `${serverUrl}/api/auth/github/callback`;

    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'read:user user:email');
    authUrl.searchParams.set('state', state);

    res.json(ApiResponse.success({
        message: 'Redirect user to this URL',
        data: { authUrl: authUrl.toString(), state },
    }));
}));

// ─── GET /api/auth/github/callback ───────────────────────────────────
// GitHub redirects here after user authorizes. Exchanges code for token,
// fetches user profile, stores in DB, redirects back to the frontend.
router.get('/callback', catchAsync(async (req: Request, res: Response) => {
    try {
        const { code, state } = req.query as { code?: string; state?: string };

        if (!code || !state) {
            res.redirect(`${getClientUrl()}/github-accounts?error=missing_params`);
            return;
        }

        const pending = pendingOAuthStates.get(state);
        if (!pending) {
            res.redirect(`${getClientUrl()}/github-accounts?error=invalid_state`);
            return;
        }
        pendingOAuthStates.delete(state);

        const clientId = process.env.GITHUB_CLIENT_ID;
        const clientSecret = process.env.GITHUB_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            res.redirect(`${getClientUrl()}/github-accounts?error=not_configured`);
            return;
        }

        // Must match the redirect_uri used during authorize
        const serverUrl = `http://localhost:${process.env.PORT || 4001}`;
        const redirectUri = `${serverUrl}/api/auth/github/callback`;

        // Exchange code for token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
        });

        const tokenData = await tokenResponse.json() as Record<string, any>;
        if (tokenData.error || !tokenData.access_token) {
            res.redirect(`${getClientUrl()}/github-accounts?error=token_exchange_failed`);
            return;
        }

        const accessToken: string = tokenData.access_token;

        // Fetch GitHub user profile
        const userResponse = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'DevManus-App', Accept: 'application/vnd.github.v3+json' },
        });
        if (!userResponse.ok) {
            res.redirect(`${getClientUrl()}/github-accounts?error=profile_fetch_failed`);
            return;
        }

        const ghUser = await userResponse.json() as { id: number; login: string; name?: string; email?: string; avatar_url?: string };

        // Fetch primary email (the /user endpoint often returns null for private emails)
        let primaryEmail = ghUser.email || null;
        try {
            const emailsRes = await fetch('https://api.github.com/user/emails', {
                headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'DevManus-App', Accept: 'application/vnd.github.v3+json' },
            });
            if (emailsRes.ok) {
                const emails = await emailsRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
                const primary = emails.find(e => e.primary && e.verified);
                if (primary) primaryEmail = primary.email;
            }
        } catch {
            // Non-critical — fall back to whatever /user returned
        }

        // Encrypt the token before storing
        const encrypted = encryptToken(accessToken);

        // Upsert: insert or update if same GitHub user already connected
        const { rows: existing } = await query(
            'SELECT id FROM github_accounts WHERE "userId" = $1 AND "githubId" = $2',
            [pending.userId, ghUser.id]
        );

        if (existing.length > 0) {
            // Update existing
            await query(
                `UPDATE github_accounts SET login = $1, name = $2, email = $3, "avatarUrl" = $4, "encryptedToken" = $5, "lastUsed" = NOW()
                 WHERE id = $6`,
                [ghUser.login, ghUser.name || null, primaryEmail, ghUser.avatar_url || null, encrypted, existing[0].id]
            );
        } else {
            // Insert new
            await query(
                `INSERT INTO github_accounts ("userId", "githubId", login, name, email, "avatarUrl", "encryptedToken", "isActive")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [pending.userId, ghUser.id, ghUser.login, ghUser.name || null, primaryEmail, ghUser.avatar_url || null, encrypted, false]
            );

            // If this is the user's first GitHub account, make it active
            const { rows: allAccounts } = await query(
                'SELECT id FROM github_accounts WHERE "userId" = $1',
                [pending.userId]
            );
            if (allAccounts.length === 1) {
                await query('UPDATE github_accounts SET "isActive" = true WHERE id = $1', [allAccounts[0].id]);
            }
        }

        res.redirect(`${getClientUrl()}/github-accounts?success=true&login=${ghUser.login}`);
    } catch (error: any) {
        logErrorReport('githubCallback', SERVICE_NAME, error, ERROR_CODES.AUTH_LOGIN_FAILED);
        res.redirect(`${getClientUrl()}/github-accounts?error=server_error`);
    }
}));

// ─── POST /api/auth/github/exchange ──────────────────────────────────
// For Electron desktop app: exchange code for token (no redirect needed)
router.post('/exchange', exchangeLimiter, catchAsync(async (req: Request, res: Response) => {
    try {
        const schema = z.object({
            code: z.string().min(1),
            redirectUri: z.string().url(),
        });
        const { code, redirectUri } = schema.parse(req.body);

        const clientId = process.env.GITHUB_CLIENT_ID;
        const clientSecret = process.env.GITHUB_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            res.status(500).json(ApiResponse.error({ message: 'GitHub OAuth is not configured on this server' }));
            return;
        }

        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
        });

        if (!tokenResponse.ok) {
            res.status(502).json(ApiResponse.error({ message: 'GitHub token exchange failed' }));
            return;
        }

        const tokenData = await tokenResponse.json() as Record<string, any>;
        if (tokenData.error) {
            res.status(400).json(ApiResponse.error({ message: `GitHub OAuth error: ${tokenData.error_description || tokenData.error}` }));
            return;
        }
        if (!tokenData.access_token) {
            res.status(502).json(ApiResponse.error({ message: 'GitHub did not return an access token' }));
            return;
        }

        res.json(ApiResponse.success({ message: 'Token exchange successful', data: { access_token: tokenData.access_token } }));
    } catch (error: any) {
        logErrorReport('githubExchange', SERVICE_NAME, error, ERROR_CODES.AUTH_LOGIN_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to exchange GitHub token' }));
    }
}));

// ─── GET /api/auth/github/accounts ───────────────────────────────────
// List all GitHub accounts for the authenticated user (tokens are NOT returned)
router.get('/accounts', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query(
            `SELECT id, "githubId", login, name, email, "avatarUrl", "isActive", "addedAt", "lastUsed"
             FROM github_accounts WHERE "userId" = $1 ORDER BY "addedAt" DESC`,
            [req.user!.userId]
        );

        res.json(ApiResponse.success({ message: 'GitHub accounts fetched', data: rows }));
    } catch (error: any) {
        logErrorReport('listGithubAccounts', SERVICE_NAME, error, ERROR_CODES.AUTH_PROFILE_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch GitHub accounts' }));
    }
}));

// ─── PATCH /api/auth/github/accounts/:id/activate ────────────────────
// Set a GitHub account as the active one (deactivates all others for this user)
router.patch('/accounts/:id/activate', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        // Verify ownership and get account details + token
        const { rows } = await query(
            'SELECT id, login, name, email, "encryptedToken" FROM github_accounts WHERE id = $1 AND "userId" = $2',
            [id, req.user!.userId]
        );
        if (rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'GitHub account not found' }));
            return;
        }

        const account = rows[0];

        // Deactivate all, activate this one
        await query('UPDATE github_accounts SET "isActive" = false WHERE "userId" = $1', [req.user!.userId]);
        await query('UPDATE github_accounts SET "isActive" = true, "lastUsed" = NOW() WHERE id = $1', [id]);

        // Update local git config (user.name + user.email)
        const gitName = account.name || account.login;
        const gitEmail = account.email || `${account.login}@users.noreply.github.com`;
        const configResult = updateGitConfig(gitName, gitEmail);

        // Store git credentials so `git push` authenticates as this account
        let credentialResult: { success: boolean; error?: string } = { success: false, error: 'Token not available' };
        const plainToken = decryptToken(account.encryptedToken);
        if (plainToken) {
            credentialResult = storeGitCredentials(account.login, plainToken);
        }

        const currentConfig = readGitConfig();

        res.json(ApiResponse.success({
            message: 'GitHub account activated',
            data: {
                gitConfig: {
                    updated: configResult.success,
                    name: currentConfig.name,
                    email: currentConfig.email,
                    error: configResult.error || null,
                },
                gitCredentials: {
                    updated: credentialResult.success,
                    error: credentialResult.error || null,
                },
            },
        }));
    } catch (error: any) {
        logErrorReport('activateGithubAccount', SERVICE_NAME, error, ERROR_CODES.AUTH_PROFILE_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to activate GitHub account' }));
    }
}));

// ─── DELETE /api/auth/github/accounts/:id ────────────────────────────
// Remove a connected GitHub account
router.delete('/accounts/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const { rows } = await query(
            'SELECT id, "isActive" FROM github_accounts WHERE id = $1 AND "userId" = $2',
            [id, req.user!.userId]
        );
        if (rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'GitHub account not found' }));
            return;
        }

        const wasActive = rows[0].isActive;
        await query('DELETE FROM github_accounts WHERE id = $1', [id]);

        // If deleted account was active, activate the next one
        if (wasActive) {
            const { rows: remaining } = await query(
                'SELECT id FROM github_accounts WHERE "userId" = $1 ORDER BY "lastUsed" DESC LIMIT 1',
                [req.user!.userId]
            );
            if (remaining.length > 0) {
                await query('UPDATE github_accounts SET "isActive" = true WHERE id = $1', [remaining[0].id]);
            }
        }

        res.json(ApiResponse.success({ message: 'GitHub account removed' }));
    } catch (error: any) {
        logErrorReport('removeGithubAccount', SERVICE_NAME, error, ERROR_CODES.AUTH_PROFILE_UPDATE_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to remove GitHub account' }));
    }
}));

// ─── GET /api/auth/github/accounts/:id/validate ─────────────────────
// Check if the stored token is still valid against GitHub API
router.get('/accounts/:id/validate', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const { rows } = await query(
            'SELECT "encryptedToken" FROM github_accounts WHERE id = $1 AND "userId" = $2',
            [id, req.user!.userId]
        );
        if (rows.length === 0) {
            res.status(404).json(ApiResponse.error({ message: 'GitHub account not found' }));
            return;
        }

        const token = decryptToken(rows[0].encryptedToken);
        if (!token) {
            res.json(ApiResponse.success({ message: 'Token validation result', data: { valid: false } }));
            return;
        }

        const ghRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'DevManus-App' },
        });

        res.json(ApiResponse.success({ message: 'Token validation result', data: { valid: ghRes.status === 200 } }));
    } catch (error: any) {
        logErrorReport('validateGithubToken', SERVICE_NAME, error, ERROR_CODES.AUTH_PROFILE_FETCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to validate token' }));
    }
}));

// ─── GET /api/auth/github/git-status ─────────────────────────────────
// Returns the current global git config + which accounts are stored in credential manager
router.get('/git-status', authMiddleware, catchAsync(async (_req: AuthRequest, res: Response) => {
    try {
        const config = readGitConfig();
        const credentials = readStoredCredentials();
        res.json(ApiResponse.success({
            message: 'Git config fetched',
            data: {
                name: config.name,
                email: config.email,
                credentials: {
                    gitCli: credentials.gitCli,
                    githubDesktop: credentials.githubDesktop,
                },
            },
        }));
    } catch (error: any) {
        res.status(500).json(ApiResponse.error({ message: 'Failed to read git config' }));
    }
}));

function getClientUrl(): string {
    return process.env.ALLOWED_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:3000';
}

export default router;
