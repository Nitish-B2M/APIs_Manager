import { describe, it, expect } from 'vitest';

// ─── Schema Validator Tests ──────────────────────────────────────────

describe('Schema Validator', () => {
    it('validates correct object', async () => {
        const { validateSchema } = await import('../services/schemaValidator');
        const result = validateSchema({ name: 'John', age: 30 }, {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' }, age: { type: 'number' } },
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('detects missing required field', async () => {
        const { validateSchema } = await import('../services/schemaValidator');
        const result = validateSchema({ age: 30 }, {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' } },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('missing required'))).toBe(true);
    });

    it('detects wrong type', async () => {
        const { validateSchema } = await import('../services/schemaValidator');
        const result = validateSchema('hello', { type: 'number' });
        expect(result.valid).toBe(false);
    });

    it('validates arrays', async () => {
        const { validateSchema } = await import('../services/schemaValidator');
        const result = validateSchema([1, 2, 3], {
            type: 'array',
            items: { type: 'number' },
        });
        expect(result.valid).toBe(true);
    });

    it('detects wrong array item type', async () => {
        const { validateSchema } = await import('../services/schemaValidator');
        const result = validateSchema([1, 'two', 3], {
            type: 'array',
            items: { type: 'number' },
        });
        expect(result.valid).toBe(false);
    });
});

// ─── Schema Generator Tests ──────────────────────────────────────────

describe('Schema Generator', () => {
    it('generates schema from object', async () => {
        const { generateSchema } = await import('../services/schemaValidator');
        const schema = generateSchema({ name: 'John', age: 30, active: true });
        expect(schema.type).toBe('object');
        expect(schema.properties.name.type).toBe('string');
        expect(schema.properties.age.type).toBe('number');
        expect(schema.properties.active.type).toBe('boolean');
        expect(schema.required).toContain('name');
    });

    it('generates schema from array', async () => {
        const { generateSchema } = await import('../services/schemaValidator');
        const schema = generateSchema([{ id: 1 }]);
        expect(schema.type).toBe('array');
        expect(schema.items.type).toBe('object');
    });

    it('generates schema from null', async () => {
        const { generateSchema } = await import('../services/schemaValidator');
        expect(generateSchema(null).type).toBe('null');
    });
});

// ─── Script Runner Tests ─────────────────────────────────────────────

describe('Script Runner', () => {
    it('runs a simple script', async () => {
        const { runScript } = await import('../services/scriptRunner');
        const result = runScript('console.log("hello")', {});
        expect(result.success).toBe(true);
        expect(result.output).toContain('hello');
    });

    it('sets and gets variables', async () => {
        const { runScript } = await import('../services/scriptRunner');
        const result = runScript(`
            pm.variables.set("token", "abc123");
            console.log(pm.variables.get("token"));
        `, {});
        expect(result.success).toBe(true);
        expect(result.variables?.token).toBe('abc123');
        expect(result.output).toContain('abc123');
    });

    it('accesses response data', async () => {
        const { runScript } = await import('../services/scriptRunner');
        const result = runScript(`
            pm.test("status is 200", function() {
                pm.expect(pm.response.code).to.equal(200);
            });
        `, {
            response: { status: 200, body: {}, headers: {}, time: 100 },
        });
        expect(result.success).toBe(true);
        expect(result.output[0]).toContain('✓');
    });

    it('catches script errors', async () => {
        const { runScript } = await import('../services/scriptRunner');
        const result = runScript('throw new Error("boom")', {});
        expect(result.success).toBe(false);
        expect(result.error).toContain('boom');
    });

    it('times out long scripts', async () => {
        const { runScript } = await import('../services/scriptRunner');
        const result = runScript('while(true){}', {}, 100);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });
});

// ─── Import Service Tests ────────────────────────────────────────────

describe('Import Service', () => {
    it('parses bulk URLs', async () => {
        const { parseImport } = await import('../services/importService');
        const result = parseImport('https://api.example.com/users\nhttps://api.example.com/posts');
        expect(result.format).toBe('bulk-urls');
        expect(result.requests).toHaveLength(2);
        expect(result.requests[0].url).toBe('https://api.example.com/users');
    });

    it('parses HAR format', async () => {
        const { parseImport } = await import('../services/importService');
        const har = JSON.stringify({
            log: {
                entries: [
                    { request: { method: 'GET', url: 'https://api.test.com/data', headers: [] } },
                    { request: { method: 'POST', url: 'https://api.test.com/submit', headers: [] } },
                ],
            },
        });
        const result = parseImport(har);
        expect(result.format).toBe('har');
        expect(result.requests).toHaveLength(2);
        expect(result.requests[0].method).toBe('GET');
        expect(result.requests[1].method).toBe('POST');
    });

    it('parses OpenAPI format', async () => {
        const { parseImport } = await import('../services/importService');
        const openapi = JSON.stringify({
            openapi: '3.0.0',
            info: { title: 'Test API', version: '1.0' },
            servers: [{ url: 'https://api.test.com' }],
            paths: {
                '/users': { get: { summary: 'List users' }, post: { summary: 'Create user' } },
            },
        });
        const result = parseImport(openapi);
        expect(result.format).toBe('openapi');
        expect(result.requests).toHaveLength(2);
        expect(result.requests[0].name).toBe('List users');
    });

    it('returns error for unknown format', async () => {
        const { parseImport } = await import('../services/importService');
        const result = parseImport('random garbage text');
        expect(result.format).toBe('unknown');
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

// ─── OAuth Presets Tests ─────────────────────────────────────────────

describe('OAuth Presets', () => {
    it('has Google preset', async () => {
        const { OAUTH_PRESETS } = await import('../services/oauthFlows');
        expect(OAUTH_PRESETS.google).toBeDefined();
        expect(OAUTH_PRESETS.google.authUrl).toContain('google');
    });

    it('has GitHub preset', async () => {
        const { OAUTH_PRESETS } = await import('../services/oauthFlows');
        expect(OAUTH_PRESETS.github).toBeDefined();
        expect(OAUTH_PRESETS.github.tokenUrl).toContain('github');
    });

    it('generates PKCE values', async () => {
        const { generatePKCE } = await import('../services/oauthFlows');
        const pkce = generatePKCE();
        expect(pkce.codeVerifier.length).toBeGreaterThan(20);
        expect(pkce.codeChallenge.length).toBeGreaterThan(20);
        expect(pkce.codeVerifier).not.toBe(pkce.codeChallenge);
    });
});

// ─── Doc Site Generator Tests ────────────────────────────────────────

describe('Doc Site Generator', () => {
    it('generates HTML with endpoints', async () => {
        const { generateDocSite } = await import('../services/docSiteGenerator');
        const html = generateDocSite('Test API', 'My API docs', [
            { name: 'Get Users', method: 'GET', url: '/api/users', description: 'Fetch all users' },
            { name: 'Create User', method: 'POST', url: '/api/users', description: 'Create a new user' },
        ], 'dark', '1.0.0');

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('Test API');
        expect(html).toContain('Get Users');
        expect(html).toContain('Create User');
        expect(html).toContain('/api/users');
        expect(html).toContain('v1.0.0');
    });

    it('supports light theme', async () => {
        const { generateDocSite } = await import('../services/docSiteGenerator');
        const html = generateDocSite('API', '', [], 'light');
        expect(html).toContain('#ffffff'); // light bg
    });
});

// ─── Token Encryption (for secret management) ───────────────────────

describe('Environment Secret Encryption', () => {
    it('encrypts and decrypts secrets correctly', async () => {
        process.env.JWT_SECRET = 'test-secret-at-least-16-chars!!';
        const { encryptSecrets, decryptSecrets } = await import('../routes/environments');

        const variables = { API_KEY: 'sk-12345', BASE_URL: 'https://api.test.com' };
        const secrets = ['API_KEY'];

        const encrypted = encryptSecrets(variables, secrets);
        expect(encrypted.API_KEY).toMatch(/^enc:/);
        expect(encrypted.BASE_URL).toBe('https://api.test.com'); // Not encrypted

        // Decrypt masked
        const masked = decryptSecrets(encrypted, secrets, false);
        expect(masked.API_KEY).toMatch(/^\*\*\*\*/);

        // Decrypt full
        const full = decryptSecrets(encrypted, secrets, true);
        expect(full.API_KEY).toBe('sk-12345');
    });
});
