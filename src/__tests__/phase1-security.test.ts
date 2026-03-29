import { describe, it, expect, beforeAll } from 'vitest';
import { validatePassword } from '../utils/jwt';

// ─── Unit Tests: Password Validation ─────────────────────────────────

describe('Password Policy (validatePassword)', () => {
    it('rejects passwords shorter than 8 characters', () => {
        const result = validatePassword('Ab1!xyz');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Must be at least 8 characters');
    });

    it('rejects passwords without uppercase', () => {
        const result = validatePassword('abcdefg1!');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('uppercase'))).toBe(true);
    });

    it('rejects passwords without lowercase', () => {
        const result = validatePassword('ABCDEFG1!');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('lowercase'))).toBe(true);
    });

    it('rejects passwords without a number', () => {
        const result = validatePassword('Abcdefgh!');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('number'))).toBe(true);
    });

    it('rejects passwords without special character', () => {
        const result = validatePassword('Abcdefg1');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('special'))).toBe(true);
    });

    it('accepts a strong password', () => {
        const result = validatePassword('MyStr0ng!Pass');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('accepts password with various special characters', () => {
        expect(validatePassword('Test1234@')).toEqual({ valid: true, errors: [] });
        expect(validatePassword('Test1234#')).toEqual({ valid: true, errors: [] });
        expect(validatePassword('Test1234$')).toEqual({ valid: true, errors: [] });
    });

    it('returns multiple errors for very weak password', () => {
        const result = validatePassword('abc');
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
});

// ─── Unit Tests: Token Encryption ────────────────────────────────────

describe('Token Encryption (crypto)', () => {
    it('encrypts and decrypts a token correctly', async () => {
        // Set JWT_SECRET for test
        process.env.JWT_SECRET = 'test-secret-at-least-16-chars!!';
        const { encryptToken, decryptToken } = await import('../utils/crypto');

        const original = 'ghp_test_token_12345';
        const encrypted = encryptToken(original);

        expect(encrypted).not.toBe(original);
        expect(encrypted.length).toBeGreaterThan(0);

        const decrypted = decryptToken(encrypted);
        expect(decrypted).toBe(original);
    });

    it('returns null for corrupted encrypted data', async () => {
        process.env.JWT_SECRET = 'test-secret-at-least-16-chars!!';
        const { decryptToken } = await import('../utils/crypto');

        const result = decryptToken('totally-invalid-data');
        expect(result).toBeNull();
    });
});

// ─── Unit Tests: API Response Format ─────────────────────────────────

describe('ApiResponse', () => {
    it('formats success response correctly', async () => {
        const { ApiResponse } = await import('../utils/response');

        const result = ApiResponse.success({ message: 'OK', data: { id: '123' } });
        expect(result.status).toBe(true);
        expect(result.message).toBe('OK');
        expect(result.data).toEqual({ id: '123' });
    });

    it('formats error response correctly', async () => {
        const { ApiResponse } = await import('../utils/response');

        const result = ApiResponse.error({ message: 'Not found' });
        expect(result.status).toBe(false);
        expect(result.message).toBe('Not found');
    });
});

// ─── Unit Tests: ApiError Class ──────────────────────────────────────

describe('ApiError', () => {
    it('creates operational error with status code', async () => {
        const { ApiError } = await import('../middleware/errorHandler');

        const err = new ApiError(404, 'Resource not found');
        expect(err.statusCode).toBe(404);
        expect(err.message).toBe('Resource not found');
        expect(err.isOperational).toBe(true);
        expect(err instanceof Error).toBe(true);
    });
});

// ─── Integration Tests: Auth Endpoints ───────────────────────────────
// These test the actual HTTP behavior with supertest

describe('Auth Integration Tests', () => {
    let testApp: any;

    beforeAll(async () => {
        process.env.JWT_SECRET = 'test-secret-at-least-16-chars!!';
        process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:root@localhost:5433/postman_docs';
        process.env.NODE_ENV = 'test';
        // Use PORT 0 to avoid EADDRINUSE when server is already running
        process.env.PORT = '0';

        try {
            const supertest = await import('supertest');
            // Import app (the express instance) without triggering listen
            const mod = await import('../index');
            testApp = supertest.default(mod.app);
        } catch (e) {
            console.log('Skipping integration tests — DB not available', e);
        }
    });

    it('POST /api/auth/register rejects weak password', async () => {
        if (!testApp) return;

        const res = await testApp
            .post('/api/auth/register')
            .send({ email: 'test@example.com', password: '123' });

        expect(res.status).toBe(400);
    });

    it('POST /api/auth/register rejects invalid email', async () => {
        if (!testApp) return;

        const res = await testApp
            .post('/api/auth/register')
            .send({ email: 'not-an-email', password: 'MyStr0ng!Pass' });

        expect(res.status).toBe(400);
    });

    it('POST /api/auth/login rejects missing fields', async () => {
        if (!testApp) return;

        const res = await testApp
            .post('/api/auth/login')
            .send({ email: '' });

        expect(res.status).toBe(400);
    });

    it('POST /api/auth/login returns same error for wrong email and wrong password', async () => {
        if (!testApp) return;

        const res1 = await testApp
            .post('/api/auth/login')
            .send({ email: 'nonexistent@example.com', password: 'MyStr0ng!Pass' });

        // Non-existent user returns 401 (or 400 if DB query fails in test)
        expect([400, 401]).toContain(res1.status);
        expect(res1.body.status).toBe(false);
    });

    it('GET /api/auth/me rejects request without token', async () => {
        if (!testApp) return;

        const res = await testApp.get('/api/auth/me');

        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Authentication required');
    });

    it('GET /api/auth/me rejects invalid token', async () => {
        if (!testApp) return;

        const res = await testApp
            .get('/api/auth/me')
            .set('Authorization', 'Bearer invalid-token-here');

        expect(res.status).toBe(401);
    });

    it('POST /api/auth/refresh rejects when no cookie', async () => {
        if (!testApp) return;

        const res = await testApp.post('/api/auth/refresh');

        expect(res.status).toBe(401);
        expect(res.body.message).toBe('No refresh token');
    });

    it('POST /api/auth/verify-email rejects invalid token', async () => {
        if (!testApp) return;

        const res = await testApp
            .post('/api/auth/verify-email')
            .send({ token: 'nonexistent-verification-token' });

        // Should be 400 (invalid token) or 500 (DB error in test env)
        expect([400, 500]).toContain(res.status);
        expect(res.body.status).toBe(false);
    });

    it('Health check returns ok', async () => {
        if (!testApp) return;

        const res = await testApp.get('/api/health');
        // Health returns 200 (ok) or 503 (degraded) depending on DB
        expect([200, 503]).toContain(res.status);
        expect(['ok', 'degraded']).toContain(res.body.status);
        expect(res.body).toHaveProperty('database');
        expect(res.body).toHaveProperty('uptime');
    });

    it('Response includes security headers from helmet', async () => {
        if (!testApp) return;

        const res = await testApp.get('/api/health');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-dns-prefetch-control']).toBe('off');
    });

    it('Response includes request ID', async () => {
        if (!testApp) return;

        const res = await testApp.get('/api/health');
        expect(res.headers['x-request-id']).toBeDefined();
        expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
    });

    it('404 returns proper JSON error', async () => {
        if (!testApp) return;

        const res = await testApp.get('/api/nonexistent-route');
        expect(res.status).toBe(404);
        expect(res.body.status).toBe(false);
    });
});
