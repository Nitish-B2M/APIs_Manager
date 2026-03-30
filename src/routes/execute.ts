import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../utils/response';
import { catchAsync } from '../utils/catchAsync';
import { runAssertions, Assertion } from '../services/testRunner';
import {
    executeRest,
    executeGraphQL,
    introspectGraphQL,
    executeWebSocket,
    executeSSE,
} from '../services/protocolExecutor';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const SERVICE_NAME = 'ExecuteService';
const router = Router();

// ─── POST /execute — unified request execution ──────────────────────

const executeSchema = z.object({
    url: z.string().min(1),
    method: z.string().default('GET'),
    headers: z.record(z.string()).optional(),
    body: z.any().optional(),
    timeout: z.number().max(60000).default(30000),
    protocol: z.enum(['REST', 'GRAPHQL', 'WS', 'SSE']).default('REST'),
    graphql: z.object({
        query: z.string(),
        variables: z.string().optional(),
        operationName: z.string().optional(),
    }).optional(),
    assertions: z.array(z.object({
        id: z.string(),
        type: z.enum(['status_code', 'response_time', 'body_contains', 'json_value']),
        expected: z.string(),
        property: z.string().optional(),
    })).optional(),
    // WebSocket/SSE options
    wsMessage: z.string().optional(),
    collectMs: z.number().max(30000).default(5000),
});

router.post('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = executeSchema.parse(req.body);

        switch (data.protocol) {
            case 'REST': {
                const response = await executeRest(data);

                // Run assertions if provided
                let testResults = undefined;
                if (data.assertions && data.assertions.length > 0) {
                    testResults = runAssertions(data.assertions as Assertion[], {
                        status: response.status,
                        time: response.time,
                        body: response.body,
                        bodyText: response.bodyText,
                    });
                }

                res.json(ApiResponse.success({
                    message: 'Request executed',
                    data: { ...response, testResults },
                }));
                return;
            }

            case 'GRAPHQL': {
                if (!data.graphql?.query) {
                    res.status(400).json(ApiResponse.error({ message: 'GraphQL query is required' }));
                    return;
                }

                const response = await executeGraphQL({
                    url: data.url,
                    method: 'POST',
                    headers: data.headers,
                    graphql: data.graphql,
                    timeout: data.timeout,
                });

                let testResults = undefined;
                if (data.assertions && data.assertions.length > 0) {
                    testResults = runAssertions(data.assertions as Assertion[], {
                        status: response.status,
                        time: response.time,
                        body: response.body,
                        bodyText: response.bodyText,
                    });
                }

                res.json(ApiResponse.success({
                    message: 'GraphQL query executed',
                    data: { ...response, testResults },
                }));
                return;
            }

            case 'WS': {
                const result = await executeWebSocket(
                    data.url,
                    data.wsMessage,
                    data.headers,
                    data.collectMs
                );

                res.json(ApiResponse.success({
                    message: 'WebSocket executed',
                    data: result,
                }));
                return;
            }

            case 'SSE': {
                const result = await executeSSE(
                    data.url,
                    data.headers,
                    data.collectMs
                );

                res.json(ApiResponse.success({
                    message: 'SSE stream collected',
                    data: result,
                }));
                return;
            }

            default:
                res.status(400).json(ApiResponse.error({ message: `Unsupported protocol: ${data.protocol}` }));
        }
    } catch (error: any) {
        logErrorReport('POST /execute', SERVICE_NAME, error, ERROR_CODES.EXEC_REST_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message || 'Execution failed' }));
    }
}));

// ─── POST /execute/graphql/introspect — schema introspection ────────

router.post('/graphql/introspect', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({
            url: z.string().url(),
            headers: z.record(z.string()).optional(),
        });
        const data = schema.parse(req.body);
        const response = await introspectGraphQL(data.url, data.headers);
        res.json(ApiResponse.success({ message: 'Schema introspected', data: response }));
    } catch (error: any) {
        logErrorReport('POST /execute/graphql/introspect', SERVICE_NAME, error, ERROR_CODES.EXEC_GRAPHQL_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message || 'Introspection failed' }));
    }
}));

// ─── POST /execute/collection — run multiple requests in sequence ───

const collectionRunSchema = z.object({
    requests: z.array(z.object({
        id: z.string().optional(),
        url: z.string(),
        method: z.string().default('GET'),
        headers: z.record(z.string()).optional(),
        body: z.any().optional(),
        protocol: z.enum(['REST', 'GRAPHQL']).default('REST'),
        graphql: z.object({
            query: z.string(),
            variables: z.string().optional(),
        }).optional(),
        assertions: z.array(z.object({
            id: z.string(),
            type: z.enum(['status_code', 'response_time', 'body_contains', 'json_value']),
            expected: z.string(),
            property: z.string().optional(),
        })).optional(),
        delayMs: z.number().max(10000).default(0),
    })),
    stopOnFailure: z.boolean().default(false),
});

router.post('/collection', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = collectionRunSchema.parse(req.body);
        const results: any[] = [];
        let totalPassed = 0;
        let totalFailed = 0;
        const startTime = Date.now();

        for (const reqItem of data.requests) {
            // Delay between requests if specified
            if (reqItem.delayMs > 0) {
                await new Promise(r => setTimeout(r, reqItem.delayMs));
            }

            try {
                const execFn = reqItem.protocol === 'GRAPHQL' ? executeGraphQL : executeRest;
                const response = await execFn({
                    url: reqItem.url,
                    method: reqItem.method,
                    headers: reqItem.headers,
                    body: reqItem.body,
                    graphql: reqItem.graphql,
                });

                let testReport = undefined;
                if (reqItem.assertions && reqItem.assertions.length > 0) {
                    testReport = runAssertions(reqItem.assertions as Assertion[], {
                        status: response.status,
                        time: response.time,
                        body: response.body,
                        bodyText: response.bodyText,
                    });
                    totalPassed += testReport.passed;
                    totalFailed += testReport.failed;
                }

                results.push({
                    id: reqItem.id,
                    url: reqItem.url,
                    method: reqItem.method,
                    status: response.status,
                    time: response.time,
                    size: response.size,
                    testReport,
                    error: null,
                });

                // Stop on failure if configured
                if (data.stopOnFailure && testReport && testReport.failed > 0) {
                    break;
                }
            } catch (err: any) {
                logErrorReport('POST /execute/collection [request]', SERVICE_NAME, err, ERROR_CODES.EXEC_COLLECTION_FAILED);
                results.push({
                    id: reqItem.id,
                    url: reqItem.url,
                    method: reqItem.method,
                    status: 0,
                    time: 0,
                    size: 0,
                    testReport: null,
                    error: err.message,
                });

                if (data.stopOnFailure) break;
            }
        }

        res.json(ApiResponse.success({
            message: 'Collection run complete',
            data: {
                results,
                summary: {
                    totalRequests: results.length,
                    totalAssertions: totalPassed + totalFailed,
                    passed: totalPassed,
                    failed: totalFailed,
                    duration: Date.now() - startTime,
                },
            },
        }));
    } catch (error: any) {
        logErrorReport('POST /execute/collection', SERVICE_NAME, error, ERROR_CODES.EXEC_COLLECTION_FAILED);
        res.status(500).json(ApiResponse.error({ message: error.message || 'Collection run failed' }));
    }
}));

export default router;
