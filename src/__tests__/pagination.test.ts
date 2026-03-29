import { describe, it, expect } from 'vitest';
import { buildPaginationMeta } from '../utils/pagination';

describe('Pagination Utility', () => {
    it('builds correct meta for first page', () => {
        const meta = buildPaginationMeta(100, { page: 1, limit: 20, offset: 0, sortBy: 'createdAt', sortOrder: 'DESC' });
        expect(meta.page).toBe(1);
        expect(meta.limit).toBe(20);
        expect(meta.total).toBe(100);
        expect(meta.totalPages).toBe(5);
        expect(meta.hasNext).toBe(true);
        expect(meta.hasPrev).toBe(false);
    });

    it('builds correct meta for last page', () => {
        const meta = buildPaginationMeta(100, { page: 5, limit: 20, offset: 80, sortBy: 'createdAt', sortOrder: 'DESC' });
        expect(meta.hasNext).toBe(false);
        expect(meta.hasPrev).toBe(true);
    });

    it('handles zero results', () => {
        const meta = buildPaginationMeta(0, { page: 1, limit: 20, offset: 0, sortBy: 'createdAt', sortOrder: 'DESC' });
        expect(meta.total).toBe(0);
        expect(meta.totalPages).toBe(0);
        expect(meta.hasNext).toBe(false);
        expect(meta.hasPrev).toBe(false);
    });

    it('handles single page', () => {
        const meta = buildPaginationMeta(5, { page: 1, limit: 20, offset: 0, sortBy: 'createdAt', sortOrder: 'DESC' });
        expect(meta.totalPages).toBe(1);
        expect(meta.hasNext).toBe(false);
        expect(meta.hasPrev).toBe(false);
    });

    it('calculates totalPages correctly for non-even division', () => {
        const meta = buildPaginationMeta(21, { page: 1, limit: 10, offset: 0, sortBy: 'createdAt', sortOrder: 'DESC' });
        expect(meta.totalPages).toBe(3); // 21/10 = 2.1, ceil = 3
    });
});
