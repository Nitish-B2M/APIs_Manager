import { query } from '../utils/db';

export interface MockResponse {
    id: string;
    requestId: string;
    statusCode: number;
    headers: any;
    body: string;
    delay: number;
    isActive: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export const mockService = {
    async getMockResponse(requestId: string): Promise<MockResponse | null> {
        const result = await query(
            'SELECT * FROM mock_responses WHERE "requestId" = $1',
            [requestId]
        );
        return result.rows[0] || null;
    },

    async upsertMockResponse(data: Partial<MockResponse> & { requestId: string }): Promise<MockResponse> {
        const existing = await this.getMockResponse(data.requestId);

        if (existing) {
            const result = await query(
                `UPDATE mock_responses 
                 SET "statusCode" = COALESCE($1, "statusCode"),
                     headers = COALESCE($2, headers),
                     body = COALESCE($3, body),
                     delay = COALESCE($4, delay),
                     "isActive" = COALESCE($5, "isActive"),
                     "updatedAt" = CURRENT_TIMESTAMP
                 WHERE "requestId" = $6
                 RETURNING *`,
                [
                    data.statusCode,
                    data.headers ? JSON.stringify(data.headers) : null,
                    data.body,
                    data.delay,
                    data.isActive,
                    data.requestId
                ]
            );
            return result.rows[0];
        } else {
            const result = await query(
                `INSERT INTO mock_responses ("requestId", "statusCode", headers, body, delay, "isActive")
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [
                    data.requestId,
                    data.statusCode || 200,
                    JSON.stringify(data.headers || {}),
                    data.body || '',
                    data.delay || 0,
                    data.isActive !== undefined ? data.isActive : true
                ]
            );
            return result.rows[0];
        }
    },

    async deleteMockResponse(requestId: string): Promise<void> {
        await query('DELETE FROM mock_responses WHERE "requestId" = $1', [requestId]);
    }
};
