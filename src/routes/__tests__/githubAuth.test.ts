import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index';

// Mock global fetch for GitHub API calls
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('POST /api/auth/github/exchange', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Set env vars for tests
        process.env.GITHUB_CLIENT_ID = 'test_client_id';
        process.env.GITHUB_CLIENT_SECRET = 'test_client_secret';
    });

    it('should return 400 if code is missing', async () => {
        const res = await request(app)
            .post('/api/auth/github/exchange')
            .send({ redirectUri: 'http://127.0.0.1:12345/callback' });

        expect(res.status).toBe(400);
    });

    it('should return 400 if redirectUri is missing', async () => {
        const res = await request(app)
            .post('/api/auth/github/exchange')
            .send({ code: 'abc123' });

        expect(res.status).toBe(400);
    });

    it('should return access_token on successful exchange', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'gho_abc123456' }),
        });

        const res = await request(app)
            .post('/api/auth/github/exchange')
            .send({
                code: 'valid_code',
                redirectUri: 'http://127.0.0.1:12345/callback',
            });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe(true);
        expect(res.body.data.access_token).toBe('gho_abc123456');
    });

    it('should return 400 if GitHub returns OAuth error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                error: 'bad_verification_code',
                error_description: 'The code passed is incorrect or expired.',
            }),
        });

        const res = await request(app)
            .post('/api/auth/github/exchange')
            .send({
                code: 'expired_code',
                redirectUri: 'http://127.0.0.1:12345/callback',
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('bad_verification_code');
    });

    it('should return 502 if GitHub API is unreachable', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 503,
            text: async () => 'Service Unavailable',
        });

        const res = await request(app)
            .post('/api/auth/github/exchange')
            .send({
                code: 'valid_code',
                redirectUri: 'http://127.0.0.1:12345/callback',
            });

        expect(res.status).toBe(502);
    });
});
