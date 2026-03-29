import { describe, it, expect } from 'vitest';

// ─── Feature Flags ───────────────────────────────────────────────────

describe('Feature Flags', () => {
    it('returns default value for known flag', async () => {
        const { isFeatureEnabled } = await import('../utils/featureFlags');
        expect(isFeatureEnabled('EMAIL_VERIFICATION')).toBe(true);
    });

    it('returns false for unknown flag', async () => {
        const { isFeatureEnabled } = await import('../utils/featureFlags');
        expect(isFeatureEnabled('NONEXISTENT_FLAG')).toBe(false);
    });

    it('respects env var override', async () => {
        process.env.FF_AI_FEATURES = 'false';
        // Need to re-import to pick up env change
        const mod = await import('../utils/featureFlags');
        expect(mod.isFeatureEnabled('AI_FEATURES')).toBe(false);
        delete process.env.FF_AI_FEATURES;
    });

    it('getAllFlags returns all flags with status', async () => {
        const { getAllFlags } = await import('../utils/featureFlags');
        const flags = getAllFlags();
        expect(flags.length).toBeGreaterThan(5);
        expect(flags[0]).toHaveProperty('name');
        expect(flags[0]).toHaveProperty('description');
        expect(flags[0]).toHaveProperty('enabled');
    });
});

// ─── API Docs ────────────────────────────────────────────────────────

describe('OpenAPI Spec Generation', () => {
    it('generates valid OpenAPI 3.1 spec', async () => {
        const { generateOpenAPISpec } = await import('../utils/apiDocs');
        const spec: any = generateOpenAPISpec();

        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info.title).toBe('DevManus API');
        expect(spec.paths).toBeDefined();
        expect(Object.keys(spec.paths).length).toBeGreaterThan(10);
    });

    it('spec includes auth endpoints', async () => {
        const { generateOpenAPISpec } = await import('../utils/apiDocs');
        const spec: any = generateOpenAPISpec();

        expect(spec.paths['/api/auth/register']).toBeDefined();
        expect(spec.paths['/api/auth/login']).toBeDefined();
        expect(spec.paths['/api/auth/me']).toBeDefined();
        expect(spec.paths['/api/auth/refresh']).toBeDefined();
    });

    it('spec includes execute endpoints', async () => {
        const { generateOpenAPISpec } = await import('../utils/apiDocs');
        const spec: any = generateOpenAPISpec();

        expect(spec.paths['/api/execute']).toBeDefined();
        expect(spec.paths['/api/execute/collection']).toBeDefined();
        expect(spec.paths['/api/search']).toBeDefined();
    });

    it('spec has security scheme', async () => {
        const { generateOpenAPISpec } = await import('../utils/apiDocs');
        const spec: any = generateOpenAPISpec();

        expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
        expect(spec.components.securitySchemes.bearerAuth.type).toBe('http');
        expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    });
});

// ─── Swagger HTML ────────────────────────────────────────────────────

describe('Swagger UI', () => {
    it('generates valid HTML', async () => {
        const { getSwaggerHTML } = await import('../utils/apiDocs');
        const html = getSwaggerHTML();

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('swagger-ui');
        expect(html).toContain('spec.json');
    });
});

// ─── Structured Logger ───────────────────────────────────────────────

describe('Structured Logger', () => {
    it('log function works without crashing', async () => {
        const { log } = await import('../utils/logger');
        // Should not throw
        log('info', 'Test message');
        log('warn', 'Warning message', { detail: 'test' });
        log('error', 'Error message', null, { service: 'TestService', requestId: 'abc123' });
    });

    it('logErrorReport produces structured output', async () => {
        const { logErrorReport } = await import('../utils/logger');
        // Should not throw
        logErrorReport('testFn', 'TestService', new Error('test error'), 'TEST_001');
    });

    it('listeners receive log entries', async () => {
        const { log, addLogListener, removeLogListener } = await import('../utils/logger');
        const entries: any[] = [];
        const listener = (entry: any) => entries.push(entry);

        addLogListener(listener);
        log('info', 'listener test');
        removeLogListener(listener);

        expect(entries.length).toBe(1);
        expect(entries[0].message).toBe('listener test');
    });

    it('requestLogger returns middleware function', async () => {
        const { requestLogger } = await import('../utils/logger');
        const middleware = requestLogger();
        expect(typeof middleware).toBe('function');
    });
});
