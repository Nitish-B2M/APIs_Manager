import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { verifyJwt } from '../utils/jwt';
import { ApiResponse } from '../utils/response';
import { catchAsync } from '../utils/catchAsync';
import {
    startScan, getScan, listScans, summarise,
    CHECK_IDS, Finding, ScanRun,
} from '../services/securityScanner';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const router = Router();
const SERVICE_NAME = 'SecurityScanService';

const startSchema = z.object({
    target: z.object({
        url: z.string().min(1),
        method: z.string().default('GET'),
        headers: z.record(z.string()).optional(),
        body: z.any().optional(),
        timeout: z.number().max(60000).optional(),
    }),
    checks: z.array(z.enum(['all', ...CHECK_IDS])).default(['all']),
});

router.post('/start', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const data = startSchema.parse(req.body);
        const run = startScan(req.user!.userId, data);
        res.json(ApiResponse.success({
            message: 'Scan started',
            data: { id: run.id, startedAt: run.startedAt, progress: run.progress },
        }));
    } catch (error: any) {
        logErrorReport('POST /security-scan/start', SERVICE_NAME, error, ERROR_CODES.EXEC_REST_FAILED);
        res.status(400).json(ApiResponse.error({ message: error.message || 'Failed to start scan' }));
    }
}));

// SSE stream — token passed via query because EventSource can't set headers.
router.get('/:id/stream', (req: Request, res: Response) => {
    const token = (req.query.token as string) || req.headers.authorization?.split(' ')[1];
    if (!token) { res.status(401).end(); return; }
    const user = verifyJwt(token);
    if (!user) { res.status(401).end(); return; }

    const run = getScan(String(req.params.id));
    if (!run || run.userId !== user.userId) { res.status(404).end(); return; }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    res.write(`data: ${JSON.stringify({
        type: 'init',
        run: { id: run.id, status: run.status, progress: run.progress },
        findings: run.findings,
    })}\n\n`);

    const onProgress = (p: any) => { try { res.write(`data: ${JSON.stringify({ type: 'progress', progress: p })}\n\n`); } catch { /* client gone */ } };
    const onFinding = (f: Finding) => { try { res.write(`data: ${JSON.stringify({ type: 'finding', finding: f })}\n\n`); } catch { /* client gone */ } };
    const onDone = (r: ScanRun) => {
        try {
            res.write(`data: ${JSON.stringify({ type: 'done', status: r.status, summary: summarise(r) })}\n\n`);
            res.end();
        } catch { /* client gone */ }
    };

    run.emitter.on('progress', onProgress);
    run.emitter.on('finding', onFinding);
    run.emitter.once('done', onDone);

    if (run.status !== 'running') onDone(run);

    const heartbeat = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); } }, 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
        run.emitter.off('progress', onProgress);
        run.emitter.off('finding', onFinding);
        run.emitter.off('done', onDone);
    });
});

router.get('/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const run = getScan(String(req.params.id));
    if (!run || run.userId !== req.user!.userId) {
        res.status(404).json(ApiResponse.error({ message: 'Scan not found' }));
        return;
    }
    res.json(ApiResponse.success({
        message: 'Scan fetched',
        data: {
            id: run.id, status: run.status, config: run.config,
            startedAt: run.startedAt, completedAt: run.completedAt,
            progress: run.progress, findings: run.findings,
            summary: summarise(run), error: run.error,
        },
    }));
}));

router.get('/', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const rows = listScans(req.user!.userId).slice(0, 20).map(r => ({
        id: r.id, status: r.status,
        startedAt: r.startedAt, completedAt: r.completedAt,
        url: r.config.target.url,
        summary: summarise(r),
    }));
    res.json(ApiResponse.success({ message: 'Scans fetched', data: rows }));
}));

router.get('/:id/export', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    const run = getScan(String(req.params.id));
    if (!run || run.userId !== req.user!.userId) {
        res.status(404).json(ApiResponse.error({ message: 'Scan not found' }));
        return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="security-scan-${run.id}.json"`);
    res.send(JSON.stringify({
        id: run.id,
        target: run.config.target,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        summary: summarise(run),
        findings: run.findings,
    }, null, 2));
}));

export default router;
