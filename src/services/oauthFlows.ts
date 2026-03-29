/**
 * OAuth 2.0 Flow Support — handles Authorization Code, Client Credentials,
 * and PKCE flows for API testing.
 */
import crypto from 'crypto';
import axios from 'axios';

export interface OAuthConfig {
    flow: 'authorization_code' | 'client_credentials' | 'pkce';
    authUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;
    redirectUri?: string;
    scope?: string;
}

export interface OAuthTokenResponse {
    access_token: string;
    token_type: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
}

// ─── Client Credentials Flow ─────────────────────────────────────────

export async function clientCredentialsFlow(config: OAuthConfig): Promise<OAuthTokenResponse> {
    const response = await axios.post(config.tokenUrl, new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret || '',
        scope: config.scope || '',
    }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
    });

    return response.data as OAuthTokenResponse;
}

// ─── Authorization Code Flow ─────────────────────────────────────────

export function buildAuthorizationUrl(config: OAuthConfig, state: string): string {
    const url = new URL(config.authUrl);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', config.redirectUri || '');
    url.searchParams.set('scope', config.scope || '');
    url.searchParams.set('state', state);
    return url.toString();
}

export async function exchangeAuthorizationCode(
    config: OAuthConfig,
    code: string,
): Promise<OAuthTokenResponse> {
    const response = await axios.post(config.tokenUrl, new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret || '',
        redirect_uri: config.redirectUri || '',
    }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
    });

    return response.data as OAuthTokenResponse;
}

// ─── PKCE Flow ───────────────────────────────────────────────────────

export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
}

export function buildPKCEAuthorizationUrl(config: OAuthConfig, state: string, codeChallenge: string): string {
    const url = new URL(config.authUrl);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', config.redirectUri || '');
    url.searchParams.set('scope', config.scope || '');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
}

export async function exchangePKCECode(
    config: OAuthConfig,
    code: string,
    codeVerifier: string,
): Promise<OAuthTokenResponse> {
    const response = await axios.post(config.tokenUrl, new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        redirect_uri: config.redirectUri || '',
        code_verifier: codeVerifier,
    }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
    });

    return response.data as OAuthTokenResponse;
}

// ─── Refresh Token ───────────────────────────────────────────────────

export async function refreshAccessToken(
    tokenUrl: string,
    clientId: string,
    clientSecret: string,
    refreshToken: string,
): Promise<OAuthTokenResponse> {
    const response = await axios.post(tokenUrl, new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
    });

    return response.data as OAuthTokenResponse;
}

// ─── Provider Presets ────────────────────────────────────────────────

export const OAUTH_PRESETS: Record<string, { authUrl: string; tokenUrl: string; scope: string }> = {
    google: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'openid email profile',
    },
    github: {
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scope: 'read:user user:email',
    },
    auth0: {
        authUrl: 'https://{domain}/authorize',
        tokenUrl: 'https://{domain}/oauth/token',
        scope: 'openid profile email',
    },
    microsoft: {
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        scope: 'openid profile email',
    },
};
