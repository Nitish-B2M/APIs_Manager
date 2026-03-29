import { Request } from 'express';
import { z } from 'zod';

/**
 * Standard pagination parameters parsed from query string.
 * Usage: const pg = parsePagination(req);
 *        query(`SELECT ... LIMIT $1 OFFSET $2`, [pg.limit, pg.offset]);
 */
export interface PaginationParams {
    page: number;
    limit: number;
    offset: number;
    sortBy: string;
    sortOrder: 'ASC' | 'DESC';
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}

const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['ASC', 'DESC', 'asc', 'desc']).default('DESC'),
});

/**
 * Parse pagination params from request query string.
 * Accepts: ?page=1&limit=20&sortBy=createdAt&sortOrder=DESC
 */
export function parsePagination(req: Request, defaults?: { limit?: number; sortBy?: string }): PaginationParams {
    const parsed = paginationSchema.safeParse({
        page: req.query.page,
        limit: req.query.limit || defaults?.limit,
        sortBy: req.query.sortBy || defaults?.sortBy,
        sortOrder: req.query.sortOrder,
    });

    const data = parsed.success ? parsed.data : { page: 1, limit: defaults?.limit || 20, sortBy: defaults?.sortBy || 'createdAt', sortOrder: 'DESC' as const };
    const page = data.page;
    const limit = data.limit;

    return {
        page,
        limit,
        offset: (page - 1) * limit,
        sortBy: data.sortBy,
        sortOrder: data.sortOrder.toUpperCase() as 'ASC' | 'DESC',
    };
}

/**
 * Build pagination metadata from total count and current params.
 */
export function buildPaginationMeta(total: number, params: PaginationParams): PaginationMeta {
    const totalPages = Math.ceil(total / params.limit);
    return {
        page: params.page,
        limit: params.limit,
        total,
        totalPages,
        hasNext: params.page < totalPages,
        hasPrev: params.page > 1,
    };
}

/**
 * Whitelist-validate a sortBy column name to prevent SQL injection.
 * Only allows columns that exist in the allowed list.
 */
export function safeSortColumn(sortBy: string, allowed: string[], fallback = '"createdAt"'): string {
    // Map common names to quoted column refs
    const col = allowed.find(a => a.toLowerCase() === sortBy.toLowerCase());
    if (!col) return fallback;
    // Quote to prevent injection
    return `"${col}"`;
}
