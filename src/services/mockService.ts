import { query } from '../utils/db';

export interface MockResponse {
    id: string;
    requestId: string;
    statusCode: number;
    headers: any;
    body: string;
    delay: number;
    isActive: boolean;
    rules: MockRule[];
    createdAt?: Date;
    updatedAt?: Date;
}

export interface MockRule {
    id: string;
    condition: {
        type: 'header' | 'body' | 'query';
        key: string;
        operator: 'equals' | 'contains' | 'regex' | 'exists';
        value: string;
    };
    response: {
        statusCode: number;
        body: string;
        headers: Record<string, string>;
    };
}

export const mockService = {
    async getMockResponse(requestId: string): Promise<MockResponse | null> {
        const result = await query(
            'SELECT * FROM mock_responses WHERE "requestId" = $1',
            [requestId]
        );
        return result.rows[0] || null;
    },

    evaluateRules(rules: MockRule[], req: any): MockRule['response'] | null {
        if (!rules || !Array.isArray(rules)) return null;

        for (const rule of rules) {
            const { condition, response } = rule;
            let actualValue: any = null;

            if (condition.type === 'header') {
                actualValue = req.headers[condition.key.toLowerCase()];
            } else if (condition.type === 'query') {
                actualValue = req.query[condition.key];
            } else if (condition.type === 'body') {
                actualValue = typeof req.body === 'object' ? req.body[condition.key] : null;
            }

            let matches = false;
            switch (condition.operator) {
                case 'equals':
                    matches = String(actualValue) === String(condition.value);
                    break;
                case 'contains':
                    matches = String(actualValue).includes(String(condition.value));
                    break;
                case 'regex':
                    try {
                        const re = new RegExp(condition.value);
                        matches = re.test(String(actualValue));
                    } catch (e) {
                        matches = false;
                    }
                    break;
                case 'exists':
                    matches = actualValue !== undefined && actualValue !== null;
                    break;
            }

            if (matches) return response;
        }

        return null;
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
                     rules = COALESCE($6, rules),
                     "updatedAt" = CURRENT_TIMESTAMP
                 WHERE "requestId" = $7
                 RETURNING *`,
                [
                    data.statusCode,
                    data.headers ? JSON.stringify(data.headers) : null,
                    data.body,
                    data.delay,
                    data.isActive,
                    data.rules ? JSON.stringify(data.rules) : null,
                    data.requestId
                ]
            );
            return result.rows[0];
        } else {
            const result = await query(
                `INSERT INTO mock_responses ("requestId", "statusCode", headers, body, delay, "isActive", rules)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [
                    data.requestId,
                    data.statusCode || 200,
                    JSON.stringify(data.headers || {}),
                    data.body || '',
                    data.delay || 0,
                    data.isActive !== undefined ? data.isActive : true,
                    JSON.stringify(data.rules || [])
                ]
            );
            return result.rows[0];
        }
    },

    async deleteMockResponse(requestId: string): Promise<void> {
        await query('DELETE FROM mock_responses WHERE "requestId" = $1', [requestId]);
    }
};
