import { describe, it, expect } from 'vitest';

// ─── Cache Tests ─────────────────────────────────────────────────────

describe('MemoryCache', () => {
    it('stores and retrieves values', async () => {
        const { cache } = await import('../utils/cache');
        cache.clear();
        cache.set('test:1', { name: 'John' }, 60);
        const entry = cache.get('test:1');
        expect(entry).not.toBeNull();
        expect(entry!.data.name).toBe('John');
        expect(entry!.etag).toMatch(/^"/);
    });

    it('returns null for expired entries', async () => {
        const { cache } = await import('../utils/cache');
        cache.clear();
        cache.set('test:expired', { data: 'old' }, 0); // 0 second TTL
        // Wait a tick
        await new Promise(r => setTimeout(r, 10));
        expect(cache.get('test:expired')).toBeNull();
    });

    it('invalidates by pattern', async () => {
        const { cache } = await import('../utils/cache');
        cache.clear();
        cache.set('docs:list:user1', [1, 2], 60);
        cache.set('docs:list:user2', [3, 4], 60);
        cache.set('notes:list:user1', [5], 60);

        const count = cache.invalidate('docs:');
        expect(count).toBe(2);
        expect(cache.get('docs:list:user1')).toBeNull();
        expect(cache.get('notes:list:user1')).not.toBeNull();
    });

    it('generates consistent ETags', async () => {
        const { cache } = await import('../utils/cache');
        cache.clear();
        const etag1 = cache.set('test:a', { x: 1 }, 60);
        cache.clear();
        const etag2 = cache.set('test:a', { x: 1 }, 60);
        expect(etag1).toBe(etag2); // Same data = same ETag
    });
});

// ─── Job Queue Tests ─────────────────────────────────────────────────

describe('JobQueue', () => {
    it('processes jobs', async () => {
        const { jobQueue } = await import('../services/jobQueue');
        let processed = false;

        jobQueue.register('test-job', async () => { processed = true; });
        jobQueue.enqueue('test-job', { msg: 'hello' });

        // Wait for async processing
        await new Promise(r => setTimeout(r, 200));
        expect(processed).toBe(true);
    });

    it('retries failed jobs', async () => {
        const { jobQueue } = await import('../services/jobQueue');
        let attempts = 0;

        jobQueue.register('retry-job', async () => {
            attempts++;
            if (attempts < 2) throw new Error('fail');
        });
        jobQueue.enqueue('retry-job', {}, 3);

        await new Promise(r => setTimeout(r, 500));
        expect(attempts).toBe(2); // Failed once, succeeded on retry
    });

    it('returns stats', async () => {
        const { jobQueue } = await import('../services/jobQueue');
        const stats = jobQueue.getStats();
        expect(stats).toHaveProperty('pending');
        expect(stats).toHaveProperty('running');
        expect(stats).toHaveProperty('completed');
        expect(stats).toHaveProperty('failed');
        expect(stats).toHaveProperty('recentJobs');
    });
});

// ─── DB Health Check Tests ───────────────────────────────────────────

// DB health is tested via the integration tests in phase1-security.test.ts (health endpoint)
// Pool config verified by TypeScript compilation of utils/db.ts

// ─── Compression Verification ────────────────────────────────────────

describe('Compression Module', () => {
    it('compression package is installed and importable', async () => {
        const compression = await import('compression');
        expect(typeof compression.default).toBe('function');
    });
});
