import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index';

// Mock the database
vi.mock('../utils/db', () => ({
    query: vi.fn(),
}));

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
    authMiddleware: (req: any, res: any, next: any) => {
        req.user = { userId: 'test-user-id' };
        next();
    },
    optionalAuthMiddleware: (req: any, res: any, next: any) => {
        req.user = { userId: 'test-user-id' };
        next();
    },
}));

import { query } from '../utils/db';

describe('Documentation Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/documentation/list', () => {
        it('should return list of documentations for authenticated user', async () => {
            const mockDocs = [
                { id: '1', title: 'Test Collection', requests: [] }
            ];
            
            (query as any).mockResolvedValueOnce({ rows: mockDocs });

            const response = await request(app)
                .get('/api/documentation/list')
                .set('Authorization', 'Bearer test-token');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe(true);
            expect(response.body.data).toEqual(mockDocs);
        });
    });

    describe('POST /api/documentation/create-empty', () => {
        it('should create an empty documentation', async () => {
            const mockDoc = {
                id: 'new-doc-id',
                title: 'New Collection',
                content: JSON.stringify({ collection: { name: 'New Collection', description: '' }, variables: {} }),
            };
            
            (query as any).mockResolvedValueOnce({ rows: [mockDoc] });

            const response = await request(app)
                .post('/api/documentation/create-empty')
                .set('Authorization', 'Bearer test-token')
                .send({ title: 'New Collection' });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe(true);
            expect(response.body.data.title).toBe('New Collection');
        });

        it('should return error for missing title', async () => {
            const response = await request(app)
                .post('/api/documentation/create-empty')
                .set('Authorization', 'Bearer test-token')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.status).toBe(false);
        });
    });

    describe('DELETE /api/documentation/:id', () => {
        it('should delete a documentation owned by user', async () => {
            const mockDoc = { id: '1', title: 'Test', userId: 'test-user-id' };
            
            (query as any)
                .mockResolvedValueOnce({ rows: [mockDoc] }) // SELECT
                .mockResolvedValueOnce({ rows: [mockDoc] }); // DELETE

            const response = await request(app)
                .delete('/api/documentation/1')
                .set('Authorization', 'Bearer test-token');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe(true);
            expect(response.body.message).toBe('Collection deleted');
        });

        it('should return 404 for non-existent documentation', async () => {
            (query as any).mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .delete('/api/documentation/nonexistent')
                .set('Authorization', 'Bearer test-token');

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/documentation/request/:requestId', () => {
        it('should delete a request', async () => {
            const mockRequest = { id: 'req-1', documentationId: 'doc-1' };
            const mockDoc = { id: 'doc-1', userId: 'test-user-id' };
            
            (query as any)
                .mockResolvedValueOnce({ rows: [mockRequest] }) // Find request
                .mockResolvedValueOnce({ rows: [mockDoc] }) // Verify ownership
                .mockResolvedValueOnce({ rows: [mockRequest] }); // Delete

            const response = await request(app)
                .delete('/api/documentation/request/req-1')
                .set('Authorization', 'Bearer test-token');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe(true);
            expect(response.body.message).toBe('Request deleted successfully');
        });
    });

    describe('PATCH /api/documentation/:id/requests/reorder', () => {
        const validId1 = '00000000-0000-0000-0000-000000000001';
        const validId2 = '00000000-0000-0000-0000-000000000002';
        const validDocId = '00000000-0000-0000-0000-000000000003';

        it('should reorder requests', async () => {
            const mockDoc = { id: validDocId, userId: 'test-user-id' };
            
            // Mock all queries - the function uses query() for BEGIN/COMMIT as well
            (query as any).mockImplementation((sql: string) => {
                if (sql.includes('SELECT')) {
                    return Promise.resolve({ rows: [mockDoc] });
                }
                // BEGIN, UPDATE, COMMIT all return empty rows
                return Promise.resolve({ rows: [] });
            });

            const response = await request(app)
                .patch(`/api/documentation/${validDocId}/requests/reorder`)
                .set('Authorization', 'Bearer test-token')
                .send({
                    requests: [
                        { id: validId1, order: 1 },
                        { id: validId2, order: 0 },
                    ]
                });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe(true);
        });

        it('should return 404 for non-existent documentation', async () => {
            (query as any).mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .patch(`/api/documentation/${validDocId}/requests/reorder`)
                .set('Authorization', 'Bearer test-token')
                .send({
                    requests: [{ id: validId1, order: 0 }]
                });

            expect(response.status).toBe(404);
        });
    });
});
