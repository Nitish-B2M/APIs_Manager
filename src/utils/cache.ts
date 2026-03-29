import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * Simple in-memory TTL cache (no Redis needed).
 * For production scale, replace with Redis.
 */

interface CacheEntry {
    data: any;
    etag: string;
    expiresAt: number;
}

class MemoryCache {
    private store = new Map<string, CacheEntry>();
    private maxSize: number;

    constructor(maxSize = 500) {
        this.maxSize = maxSize;
        // Cleanup expired entries every 60s
        setInterval(() => this.cleanup(), 60_000);
    }

    get(key: string): CacheEntry | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry;
    }

    set(key: string, data: any, ttlSeconds: number): string {
        // Evict oldest if at capacity
        if (this.store.size >= this.maxSize) {
            const oldest = this.store.keys().next().value;
            if (oldest) this.store.delete(oldest);
        }

        const etag = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex').substring(0, 16);
        this.store.set(key, {
            data,
            etag: `"${etag}"`,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
        return `"${etag}"`;
    }

    invalidate(pattern: string): number {
        let count = 0;
        for (const key of this.store.keys()) {
            if (key.includes(pattern)) {
                this.store.delete(key);
                count++;
            }
        }
        return count;
    }

    clear(): void {
        this.store.clear();
    }

    get size(): number {
        return this.store.size;
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.store) {
            if (now > entry.expiresAt) this.store.delete(key);
        }
    }
}

export const cache = new MemoryCache();

/**
 * ETag middleware — checks If-None-Match header and returns 304 if cached.
 * Usage: app.get('/api/data', etagCache('data', 300), handler)
 */
export function etagCache(prefix: string, ttlSeconds = 300) {
    return (req: Request, res: Response, next: NextFunction) => {
        const key = `${prefix}:${req.originalUrl}:${(req as any).user?.userId || 'anon'}`;
        const cached = cache.get(key);

        if (cached) {
            const clientEtag = req.headers['if-none-match'];
            if (clientEtag === cached.etag) {
                res.status(304).end();
                return;
            }
            // Return cached data with ETag header
            res.setHeader('ETag', cached.etag);
            res.setHeader('Cache-Control', `private, max-age=${ttlSeconds}`);
            res.json(cached.data);
            return;
        }

        // Override res.json to cache the response
        const originalJson = res.json.bind(res);
        res.json = (body: any) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const etag = cache.set(key, body, ttlSeconds);
                res.setHeader('ETag', etag);
                res.setHeader('Cache-Control', `private, max-age=${ttlSeconds}`);
            }
            return originalJson(body);
        };

        next();
    };
}
