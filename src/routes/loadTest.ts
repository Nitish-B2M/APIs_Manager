import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { verifyJwt } from '../utils/jwt';
import { ApiResponse } from '../utils/response';
import { catchAsync } from '../utils/catchAsync';
import {
    startLoadTest,
    getRun,
    listRuns,
    stopRun,
    toCsv,
    Bucket,
    LoadTestRun,
} from '../services/loadTester';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const router = Router();
const SERVICE_NAME = 'LoadTestService';

const startSchema = z.object({
    target: z.object({
        url: z.string().min(1),
        method: z.string().default('GET'),
        headers: z.record(z.string()).optional(),
        body: z.any().optional(),
        timeout: z.number().max(60000).optional(),
    }),
    virtualUsers: z.number().int().min(1).max(500),
    durationMs: z.number().int().min(1000).max(300_000),
    rampUpMs: z.number().int().min(0).max(60_000).default(0),
});

// ─── POST /start — begin a load test run ─────────────────────────────

router.post('/start', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = startSchema.parse(req.body);
        const run = startLoadTest(req.user!.userId, data);
        res.json(ApiResponse.success({
            message: 'Load test started',
            data: { id: run.id, startedAt: run.startedAt, config: run.config },
        }));
    } catch (error: any) {
        logErrorReport('POST /load-test/start', SERVICE_NAME, error, ERROR_CODES.EXEC_REST_FAILED);
        res.status(400).json(ApiResponse.error({ message: error.message || 'Failed to start load test' }));
    }
}));

// ─── GET /:id/stream — SSE live metrics ──────────────────────────────
// EventSource can't set Authorization header, so we accept ?token=
// as a query parameter for this endpoint only.

router.get('/:id/stream', (req: Request, res: Response) => {
    const token = (req.query.token as string) || req.headers.authorization?.split(' ')[1];
    if (!token) { res.status(401).end(); return; }
    const user = verifyJwt(token);
    if (!user) { res.status(401).end(); return; }

    const run = getRun(String(req.params.id));
    if (!run || run.userId !== user.userId) { res.status(404).end(); return; }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    // Flush any buckets already emitted before subscribe
    res.write(`data: ${JSON.stringify({ type: 'init', run: { id: run.id, status: run.status, startedAt: run.startedAt, config: run.config }, buckets: run.buckets })}\n\n`);

    const onBucket = (bucket: Bucket) => {
        try { res.write(`data: ${JSON.stringify({ type: 'bucket', bucket })}\n\n`); } catch { /* client gone */ }
    };
    const onDone = (r: LoadTestRun) => {
        try {
            res.write(`data: ${JSON.stringify({ type: 'done', summary: r.summary, status: r.status })}\n\n`);
            res.end();
        } catch { /* client gone */ }
    };

    run.emitter.on('bucket', onBucket);
    run.emitter.once('done', onDone);

    // If the run already finished before the client subscribed, emit done immediately.
    if (run.status !== 'running') {
        onDone(run);
    }

    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
    }, 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
        run.emitter.off('bucket', onBucket);
        run.emitter.off('done', onDone);
    });
});

// ─── POST /:id/stop — abort an in-flight run ─────────────────────────

router.post('/:id/stop', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const run = getRun(String(req.params.id));
    if (!run || run.userId !== req.user!.userId) {
        res.status(404).json(ApiResponse.error({ message: 'Run not found' }));
        return;
    }
    const ok = stopRun(String(req.params.id));
    res.json(ApiResponse.success({ message: ok ? 'Stop requested' : 'Run is not active', data: { stopped: ok } }));
}));

// ─── GET /:id — final results ────────────────────────────────────────

router.get('/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const run = getRun(String(req.params.id));
    if (!run || run.userId !== req.user!.userId) {
        res.status(404).json(ApiResponse.error({ message: 'Run not found' }));
        return;
    }
    res.json(ApiResponse.success({
        message: 'Run fetched',
        data: {
            id: run.id,
            status: run.status,
            config: run.config,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            buckets: run.buckets,
            summary: run.summary,
            error: run.error,
        },
    }));
}));

// ─── GET / — list recent runs for the user ───────────────────────────

router.get('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const rows = listRuns(req.user!.userId).slice(0, 20).map(r => ({
        id: r.id,
        status: r.status,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        config: r.config,
        summary: r.summary,
    }));
    res.json(ApiResponse.success({ message: 'Runs fetched', data: rows }));
}));

// ─── GET /:id/export?format=json|csv — download full sample data ────

router.get('/:id/export', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const run = getRun(String(req.params.id));
    if (!run || run.userId !== req.user!.userId) {
        res.status(404).json(ApiResponse.error({ message: 'Run not found' }));
        return;
    }
    const format = (req.query.format as string) || 'json';
    if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="load-test-${run.id}.csv"`);
        res.send(toCsv(run));
        return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="load-test-${run.id}.json"`);
    res.send(JSON.stringify({
        id: run.id,
        config: run.config,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        status: run.status,
        summary: run.summary,
        buckets: run.buckets,
        samples: run.samples,
    }, null, 2));
}));

export default router;
