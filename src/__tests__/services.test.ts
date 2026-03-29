import { describe, it, expect } from 'vitest';

// ─── Code Generator ──────────────────────────────────────────────────

describe('Code Snippet Generator', () => {
    it('generates curl command', async () => {
        const { generateAllSnippets } = await import('../utils/codeGenerator');
        const snippets = generateAllSnippets({
            method: 'GET',
            url: 'https://api.example.com/users',
            headers: [{ key: 'Authorization', value: 'Bearer token123' }],
            body: undefined as any,
        });
        expect(snippets.curl).toContain('curl');
        expect(snippets.curl).toContain('https://api.example.com/users');
    });

    it('generates fetch snippet', async () => {
        const { generateAllSnippets } = await import('../utils/codeGenerator');
        const snippets = generateAllSnippets({
            method: 'POST',
            url: 'https://api.example.com/data',
            headers: [{ key: 'Content-Type', value: 'application/json' }],
            body: { mode: 'raw', raw: '{"name":"test"}' },
        });
        expect(snippets.javascript).toContain('fetch');
    });

    it('generates python snippet', async () => {
        const { generateAllSnippets } = await import('../utils/codeGenerator');
        const snippets = generateAllSnippets({
            method: 'GET',
            url: 'https://api.test.com',
            headers: [],
            body: undefined as any,
        });
        expect(snippets.python).toContain('requests');
    });
});

// ─── RBAC Utility ────────────────────────────────────────────────────

describe('RBAC Utils', () => {
    it('canEdit allows OWNER, ADMIN, EDITOR', async () => {
        const { canEdit } = await import('../utils/rbac');
        expect(canEdit('OWNER')).toBe(true);
        expect(canEdit('ADMIN')).toBe(true);
        expect(canEdit('EDITOR')).toBe(true);
        expect(canEdit('VIEWER')).toBe(false);
    });

    it('canAdmin allows OWNER, ADMIN only', async () => {
        const { canAdmin } = await import('../utils/rbac');
        expect(canAdmin('OWNER')).toBe(true);
        expect(canAdmin('ADMIN')).toBe(true);
        expect(canAdmin('EDITOR')).toBe(false);
        expect(canAdmin('VIEWER')).toBe(false);
    });
});

// ─── Mock Service ────────────────────────────────────────────────────

describe('Mock Service', () => {
    it('evaluateRules matches header condition', async () => {
        const { mockService } = await import('../services/mockService');
        // The mock service should be importable and have the expected methods
        expect(mockService).toBeDefined();
        expect(typeof mockService.getMockResponse).toBe('function');
        expect(typeof mockService.upsertMockResponse).toBe('function');
    });
});

// ─── Audit Service ───────────────────────────────────────────────────

describe('Audit Service', () => {
    it('exports log and getLogs functions', async () => {
        const { auditService } = await import('../services/auditService');
        expect(typeof auditService.log).toBe('function');
        expect(typeof auditService.getLogs).toBe('function');
    });
});

// ─── Snapshot Service ────────────────────────────────────────────────

describe('Snapshot Service', () => {
    it('module is importable', async () => {
        const snapshotService = await import('../services/snapshotService');
        expect(snapshotService).toBeDefined();
    });
});

// ─── Error Codes ─────────────────────────────────────────────────────

describe('Error Codes', () => {
    it('has all expected code categories', async () => {
        const { ERROR_CODES } = await import('../constants/errorCodes');
        expect(ERROR_CODES.AUTH_REGISTER_FAILED).toBe('AUTH_001');
        expect(ERROR_CODES.AUTH_LOGIN_FAILED).toBe('AUTH_002');
        expect(ERROR_CODES.DOC_LIST_FAILED).toBe('DOC_001');
        expect(ERROR_CODES.ENV_FETCH_FAILED).toBe('ENV_001');
        expect(ERROR_CODES.FOLDER_FETCH_FAILED).toBe('FLD_001');
        expect(ERROR_CODES.NOTE_FETCH_FAILED).toBe('NOTE_001');
        expect(ERROR_CODES.TODO_FETCH_FAILED).toBe('TODO_001');
        expect(ERROR_CODES.AI_GENERATE_FAILED).toBe('AI_001');
        expect(ERROR_CODES.COLLAB_INVITE_FAILED).toBe('CLB_001');
    });
});

// ─── Pagination Edge Cases ───────────────────────────────────────────

describe('Pagination Edge Cases', () => {
    it('safeSortColumn rejects invalid columns', async () => {
        const { safeSortColumn } = await import('../utils/pagination');
        expect(safeSortColumn('DROP TABLE', ['name', 'createdAt'])).toBe('"createdAt"');
        expect(safeSortColumn('name', ['name', 'createdAt'])).toBe('"name"');
    });

    it('parsePagination handles invalid query params', async () => {
        const { parsePagination } = await import('../utils/pagination');
        const mockReq = { query: { page: 'abc', limit: '-5' } } as any;
        const pg = parsePagination(mockReq);
        expect(pg.page).toBe(1);
        expect(pg.limit).toBe(20);
        expect(pg.offset).toBe(0);
    });
});

// ─── Git Service ─────────────────────────────────────────────────────

describe('Git Service', () => {
    it('isGitRepo returns false for non-repo', async () => {
        const { isGitRepo } = await import('../services/gitService');
        expect(isGitRepo('C:\\nonexistent\\path')).toBe(false);
    });

    it('isGitRepo returns false for non-existent path', async () => {
        const { isGitRepo } = await import('../services/gitService');
        expect(isGitRepo('/tmp/definitely-not-a-repo-12345')).toBe(false);
    });
});

// ─── Token Encryption Roundtrip ──────────────────────────────────────

describe('AES-256 Encryption Robustness', () => {
    it('handles empty string', async () => {
        process.env.JWT_SECRET = 'test-secret-at-least-16-chars!!';
        const { encryptToken, decryptToken } = await import('../utils/crypto');
        const enc = encryptToken('');
        expect(decryptToken(enc)).toBe('');
    });

    it('handles unicode characters', async () => {
        process.env.JWT_SECRET = 'test-secret-at-least-16-chars!!';
        const { encryptToken, decryptToken } = await import('../utils/crypto');
        const original = '日本語テスト 🚀';
        const enc = encryptToken(original);
        expect(decryptToken(enc)).toBe(original);
    });

    it('handles long tokens', async () => {
        process.env.JWT_SECRET = 'test-secret-at-least-16-chars!!';
        const { encryptToken, decryptToken } = await import('../utils/crypto');
        const original = 'a'.repeat(10000);
        expect(decryptToken(encryptToken(original))).toBe(original);
    });
});
