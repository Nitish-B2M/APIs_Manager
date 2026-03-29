import { Request, Response, NextFunction } from 'express';

/**
 * In-memory token registry — maps accountId to GitHub access token.
 * Populated by the Electron main process via IPC, or by API calls from the desktop app.
 */
const tokenRegistry = new Map<string, string>();

/** Register a GitHub token for an account ID */
export function registerGithubToken(accountId: string, token: string): void {
    tokenRegistry.set(accountId, token);
}

/** Remove a GitHub token from the registry */
export function unregisterGithubToken(accountId: string): void {
    tokenRegistry.delete(accountId);
}

/** Get all registered account IDs */
export function getRegisteredAccountIds(): string[] {
    return Array.from(tokenRegistry.keys());
}

export interface GithubAccountRequest extends Request {
    githubToken?: string;
    githubAccountId?: string;
}

/**
 * Middleware that reads x-github-account-id header and attaches the
 * corresponding GitHub token to the request. The renderer only sends
 * the account ID — never the token itself.
 */
export function githubAccountMiddleware(req: GithubAccountRequest, _res: Response, next: NextFunction): void {
    const accountId = req.headers['x-github-account-id'] as string | undefined;

    if (accountId) {
        const token = tokenRegistry.get(accountId);
        if (token) {
            req.githubToken = token;
            req.githubAccountId = accountId;
        }
    }

    next();
}
