/**
 * Load Tester — runs N concurrent virtual users against a target request,
 * optionally ramping up over time, and collects latency/status metrics.
 *
 * State is held in-memory and streamed to subscribers via a simple
 * event-emitter pattern. Each run is identified by a UUID.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { executeRest, ExecuteRequest } from './protocolExecutor';

// ─── Types ───────────────────────────────────────────────────────────

export interface LoadTestConfig {
    target: ExecuteRequest;
    virtualUsers: number;   // concurrent worker count at peak
    durationMs: number;     // total test duration
    rampUpMs: number;       // time to reach full VU count (0 = instant)
}

export interface Sample {
    t: number;              // ms since test start
    status: number;         // 0 = network error
    time: number;           // response time in ms
    error?: string;
}

export interface Bucket {
    second: number;         // seconds since test start
    rps: number;
    p50: number;
    p95: number;
    p99: number;
    errors: number;
    statusCounts: Record<string, number>;
}

export interface RunSummary {
    total: number;
    succeeded: number;
    failed: number;
    errorRate: number;
    avgMs: number;
    p50: number;
    p95: number;
    p99: number;
    minMs: number;
    maxMs: number;
    rpsAvg: number;
    statusCounts: Record<string, number>;
    durationMs: number;
}

export interface LoadTestRun {
    id: string;
    userId: string;
    config: LoadTestConfig;
    status: 'running' | 'completed' | 'stopped' | 'error';
    startedAt: number;
    completedAt?: number;
    samples: Sample[];
    buckets: Bucket[];
    summary?: RunSummary;
    emitter: EventEmitter;
    abort: boolean;
    error?: string;
}

// ─── In-memory store ─────────────────────────────────────────────────

const runs = new Map<string, LoadTestRun>();

export function getRun(id: string): LoadTestRun | undefined {
    return runs.get(id);
}

export function listRuns(userId: string): LoadTestRun[] {
    return Array.from(runs.values())
        .filter(r => r.userId === userId)
        .sort((a, b) => b.startedAt - a.startedAt);
}

export function stopRun(id: string): boolean {
    const run = runs.get(id);
    if (!run || run.status !== 'running') return false;
    run.abort = true;
    return true;
}

// Purge runs older than 1 hour to avoid leaking memory
setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, run] of runs) {
        if (run.status !== 'running' && (run.completedAt ?? run.startedAt) < cutoff) {
            runs.delete(id);
        }
    }
}, 10 * 60 * 1000).unref();

// ─── Percentile helper ───────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}

// ─── Run lifecycle ───────────────────────────────────────────────────

export function startLoadTest(userId: string, config: LoadTestConfig): LoadTestRun {
    const id = randomUUID();
    const run: LoadTestRun = {
        id,
        userId,
        config,
        status: 'running',
        startedAt: Date.now(),
        samples: [],
        buckets: [],
        emitter: new EventEmitter(),
        abort: false,
    };
    runs.set(id, run);

    // Kick off async execution; errors land on the run object.
    execute(run).catch(err => {
        run.status = 'error';
        run.error = err?.message || String(err);
        run.completedAt = Date.now();
        run.emitter.emit('done', run);
    });

    return run;
}

async function execute(run: LoadTestRun): Promise<void> {
    const { virtualUsers, durationMs, rampUpMs, target } = run.config;
    const endAt = run.startedAt + durationMs;

    // Bucket emitter: aggregate samples every second and emit.
    let lastBucketSecond = -1;
    const bucketTimer = setInterval(() => {
        const now = Date.now();
        const second = Math.floor((now - run.startedAt) / 1000);
        if (second === lastBucketSecond) return;
        // Flush each integer second we've passed
        for (let s = lastBucketSecond + 1; s <= second; s++) {
            const windowStart = s * 1000;
            const windowEnd = (s + 1) * 1000;
            const inWindow = run.samples.filter(x => x.t >= windowStart && x.t < windowEnd);
            const times = inWindow.map(x => x.time).sort((a, b) => a - b);
            const statusCounts: Record<string, number> = {};
            let errors = 0;
            for (const sample of inWindow) {
                const key = sample.status === 0 ? 'error' : String(sample.status);
                statusCounts[key] = (statusCounts[key] || 0) + 1;
                if (sample.status === 0 || sample.status >= 400) errors++;
            }
            const bucket: Bucket = {
                second: s,
                rps: inWindow.length,
                p50: percentile(times, 50),
                p95: percentile(times, 95),
                p99: percentile(times, 99),
                errors,
                statusCounts,
            };
            run.buckets.push(bucket);
            run.emitter.emit('bucket', bucket);
        }
        lastBucketSecond = second;
    }, 500);
    bucketTimer.unref();

    // Spawn virtual users. Each VU is a loop that fires requests until
    // the test window ends or abort is set.
    const vuPromises: Promise<void>[] = [];
    for (let i = 0; i < virtualUsers; i++) {
        const spawnDelay = rampUpMs > 0 ? (i / virtualUsers) * rampUpMs : 0;
        vuPromises.push((async () => {
            if (spawnDelay > 0) await new Promise(r => setTimeout(r, spawnDelay));
            while (!run.abort && Date.now() < endAt) {
                const t0 = Date.now();
                try {
                    const resp = await executeRest({ ...target, timeout: Math.min(target.timeout ?? 30000, durationMs) });
                    run.samples.push({
                        t: t0 - run.startedAt,
                        status: resp.status,
                        time: resp.time,
                    });
                } catch (err: any) {
                    run.samples.push({
                        t: t0 - run.startedAt,
                        status: 0,
                        time: Date.now() - t0,
                        error: err?.message || String(err),
                    });
                }
            }
        })());
    }

    await Promise.all(vuPromises);
    clearInterval(bucketTimer);

    // Final summary
    const times = run.samples.map(s => s.time).sort((a, b) => a - b);
    const statusCounts: Record<string, number> = {};
    let failed = 0;
    for (const s of run.samples) {
        const key = s.status === 0 ? 'error' : String(s.status);
        statusCounts[key] = (statusCounts[key] || 0) + 1;
        if (s.status === 0 || s.status >= 400) failed++;
    }
    const actualDuration = (run.completedAt = Date.now()) - run.startedAt;
    run.summary = {
        total: run.samples.length,
        succeeded: run.samples.length - failed,
        failed,
        errorRate: run.samples.length ? failed / run.samples.length : 0,
        avgMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
        p50: percentile(times, 50),
        p95: percentile(times, 95),
        p99: percentile(times, 99),
        minMs: times[0] || 0,
        maxMs: times[times.length - 1] || 0,
        rpsAvg: run.samples.length / (actualDuration / 1000),
        statusCounts,
        durationMs: actualDuration,
    };
    run.status = run.abort ? 'stopped' : 'completed';
    run.emitter.emit('done', run);
}

// ─── Export helpers ──────────────────────────────────────────────────

export function toCsv(run: LoadTestRun): string {
    const rows = ['t_ms,status,response_time_ms,error'];
    for (const s of run.samples) {
        rows.push(`${s.t},${s.status},${s.time},${(s.error || '').replace(/,/g, ';')}`);
    }
    return rows.join('\n');
}
