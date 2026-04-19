/**
 * Security Scanner — probes a target request for common API vulnerabilities.
 *
 * Each check is a small, independent function that returns zero or more
 * Findings. The orchestrator runs them sequentially against the target and
 * streams progress through an EventEmitter, mirroring the load-tester shape.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import axios from 'axios';
import { executeRest, ExecuteRequest, ExecuteResponse } from './protocolExecutor';

// ─── Types ───────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
    id: string;
    checkId: string;
    check: string;
    severity: Severity;
    title: string;
    description: string;
    remediation: string;
    evidence?: string;
}

export interface ScanConfig {
    target: ExecuteRequest;
    checks: string[]; // subset of CHECK_IDS or ['all']
}

export interface ScanRun {
    id: string;
    userId: string;
    config: ScanConfig;
    status: 'running' | 'completed' | 'error';
    startedAt: number;
    completedAt?: number;
    findings: Finding[];
    progress: { completed: number; total: number; currentCheck?: string };
    emitter: EventEmitter;
    error?: string;
}

export const CHECK_IDS = [
    'sql_injection',
    'xss_reflection',
    'security_headers',
    'cors_misconfig',
    'secret_exposure',
    'auth_bypass',
    'rate_limit',
    'https_enforcement',
] as const;

// ─── In-memory store ─────────────────────────────────────────────────

const runs = new Map<string, ScanRun>();
export function getScan(id: string): ScanRun | undefined { return runs.get(id); }
export function listScans(userId: string): ScanRun[] {
    return Array.from(runs.values())
        .filter(r => r.userId === userId)
        .sort((a, b) => b.startedAt - a.startedAt);
}

setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, r] of runs) {
        if (r.status !== 'running' && (r.completedAt ?? r.startedAt) < cutoff) runs.delete(id);
    }
}, 10 * 60 * 1000).unref();

// ─── Helpers ─────────────────────────────────────────────────────────

function finding(partial: Omit<Finding, 'id'>): Finding {
    return { id: randomUUID(), ...partial };
}

async function safeExec(req: ExecuteRequest): Promise<ExecuteResponse | null> {
    try { return await executeRest({ ...req, timeout: req.timeout ?? 10000 }); }
    catch { return null; }
}

function asString(body: any): string {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    try { return JSON.stringify(body); } catch { return String(body); }
}

// ─── Check 1: SQL injection ──────────────────────────────────────────

const SQL_PAYLOADS = [`' OR '1'='1`, `1; DROP TABLE users--`, `' UNION SELECT NULL--`];
const SQL_ERROR_PATTERNS = [
    /sql syntax.*mysql/i,
    /warning.*mysql_/i,
    /postgresql.*error/i,
    /ora-\d{5}/i,
    /sqlite.*error/i,
    /unclosed quotation mark/i,
    /syntax error.*near/i,
    /odbc.*driver/i,
];

async function checkSqlInjection(target: ExecuteRequest): Promise<Finding[]> {
    const findings: Finding[] = [];
    const url = new URL(target.url);
    const params = Array.from(url.searchParams.keys());

    for (const payload of SQL_PAYLOADS) {
        // Inject into each query param (if any) or append a probe param.
        const u = new URL(target.url);
        if (params.length > 0) {
            for (const p of params) u.searchParams.set(p, payload);
        } else {
            u.searchParams.set('q', payload);
        }
        const resp = await safeExec({ ...target, url: u.toString() });
        if (!resp) continue;
        const bodyText = resp.bodyText || asString(resp.body);
        for (const pattern of SQL_ERROR_PATTERNS) {
            if (pattern.test(bodyText)) {
                findings.push(finding({
                    checkId: 'sql_injection',
                    check: 'SQL Injection',
                    severity: 'high',
                    title: 'Possible SQL injection',
                    description: `Response contains a database error message when the parameter is fuzzed with "${payload}".`,
                    remediation: 'Use parameterised queries or an ORM. Never concatenate user input into SQL. Ensure database errors are not surfaced to clients.',
                    evidence: bodyText.match(pattern)?.[0]?.slice(0, 200),
                }));
                return findings; // one is enough
            }
        }
    }
    return findings;
}

// ─── Check 2: Reflected XSS ──────────────────────────────────────────

async function checkXssReflection(target: ExecuteRequest): Promise<Finding[]> {
    const marker = `zx${Math.random().toString(36).slice(2, 8)}`;
    const payload = `<script>/*${marker}*/</script>`;
    const u = new URL(target.url);
    const existing = Array.from(u.searchParams.keys());
    if (existing.length) {
        for (const p of existing) u.searchParams.set(p, payload);
    } else {
        u.searchParams.set('q', payload);
    }
    const resp = await safeExec({ ...target, url: u.toString() });
    if (!resp) return [];
    const bodyText = resp.bodyText || asString(resp.body);
    const contentType = (resp.headers?.['content-type'] as string | undefined) || '';
    // Only flag HTML-ish responses — JSON APIs echoing the value are low risk.
    if (!/html/i.test(contentType)) return [];
    if (bodyText.includes(payload)) {
        return [finding({
            checkId: 'xss_reflection',
            check: 'Reflected XSS',
            severity: 'high',
            title: 'Script payload reflected in HTML response',
            description: `The payload "${payload}" was echoed verbatim into a text/html response without escaping.`,
            remediation: 'HTML-encode user-controlled values before rendering. Set a strict Content-Security-Policy with no `unsafe-inline`.',
            evidence: payload,
        })];
    }
    return [];
}

// ─── Check 3: Missing security headers ───────────────────────────────

async function checkSecurityHeaders(target: ExecuteRequest): Promise<Finding[]> {
    const resp = await safeExec(target);
    if (!resp) return [];
    const h: Record<string, string> = {};
    for (const [k, v] of Object.entries(resp.headers || {})) {
        h[k.toLowerCase()] = String(v);
    }
    const isHttps = target.url.startsWith('https://');
    const findings: Finding[] = [];

    if (!h['content-security-policy']) {
        findings.push(finding({
            checkId: 'security_headers', check: 'Security Headers',
            severity: 'medium', title: 'Missing Content-Security-Policy',
            description: 'Response does not include a Content-Security-Policy header.',
            remediation: `Set a CSP such as "default-src 'self'; script-src 'self'".`,
        }));
    }
    if (isHttps && !h['strict-transport-security']) {
        findings.push(finding({
            checkId: 'security_headers', check: 'Security Headers',
            severity: 'medium', title: 'Missing HSTS header',
            description: 'HTTPS endpoint does not set Strict-Transport-Security.',
            remediation: 'Return `Strict-Transport-Security: max-age=31536000; includeSubDomains`.',
        }));
    }
    if (!h['x-frame-options'] && !/frame-ancestors/i.test(h['content-security-policy'] || '')) {
        findings.push(finding({
            checkId: 'security_headers', check: 'Security Headers',
            severity: 'low', title: 'Missing X-Frame-Options',
            description: 'Response can be framed by any origin (clickjacking risk).',
            remediation: 'Return `X-Frame-Options: DENY` or a CSP `frame-ancestors` directive.',
        }));
    }
    if (!h['x-content-type-options']) {
        findings.push(finding({
            checkId: 'security_headers', check: 'Security Headers',
            severity: 'low', title: 'Missing X-Content-Type-Options',
            description: 'Browsers may MIME-sniff the response.',
            remediation: 'Return `X-Content-Type-Options: nosniff`.',
        }));
    }
    return findings;
}

// ─── Check 4: CORS misconfiguration ──────────────────────────────────

async function checkCorsMisconfig(target: ExecuteRequest): Promise<Finding[]> {
    const evilOrigin = 'https://evil.example.com';
    const resp = await safeExec({
        ...target,
        headers: { ...(target.headers || {}), Origin: evilOrigin },
    });
    if (!resp) return [];
    const allowOrigin = String(resp.headers?.['access-control-allow-origin'] || '').trim();
    const allowCreds = String(resp.headers?.['access-control-allow-credentials'] || '').toLowerCase();
    const findings: Finding[] = [];

    if (allowOrigin === '*' && allowCreds === 'true') {
        findings.push(finding({
            checkId: 'cors_misconfig', check: 'CORS',
            severity: 'high', title: 'Wildcard CORS with credentials',
            description: 'Server returns `Access-Control-Allow-Origin: *` together with `Allow-Credentials: true` — browsers reject this combo, but non-browser clients do not.',
            remediation: 'Echo an explicit allowlisted origin instead of `*` when credentials are enabled.',
            evidence: `ACAO=${allowOrigin}; ACAC=${allowCreds}`,
        }));
    } else if (allowOrigin === evilOrigin) {
        findings.push(finding({
            checkId: 'cors_misconfig', check: 'CORS',
            severity: allowCreds === 'true' ? 'high' : 'medium',
            title: 'Server reflects arbitrary Origin',
            description: `The server echoed the attacker-controlled Origin "${evilOrigin}" into Access-Control-Allow-Origin${allowCreds === 'true' ? ' with credentials allowed' : ''}.`,
            remediation: 'Validate the Origin against a strict allowlist before echoing.',
            evidence: `ACAO=${allowOrigin}; ACAC=${allowCreds}`,
        }));
    }
    return findings;
}

// ─── Check 5: Secret / token exposure in response ────────────────────

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
    { name: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
    { name: 'AWS Secret Key', re: /aws(.{0,20})?['"][0-9a-zA-Z/+]{40}['"]/ },
    { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
    { name: 'Slack token', re: /xox[abpr]-[A-Za-z0-9-]{10,}/ },
    { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
    { name: 'Stripe key', re: /sk_live_[0-9a-zA-Z]{24,}/ },
    { name: 'Private key (PEM)', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
    { name: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

async function checkSecretExposure(target: ExecuteRequest): Promise<Finding[]> {
    const resp = await safeExec(target);
    if (!resp) return [];
    const bodyText = resp.bodyText || asString(resp.body);
    const findings: Finding[] = [];
    for (const { name, re } of SECRET_PATTERNS) {
        const m = bodyText.match(re);
        if (m) {
            const isJwt = name === 'JWT';
            findings.push(finding({
                checkId: 'secret_exposure', check: 'Secret Exposure',
                severity: isJwt ? 'medium' : 'critical',
                title: `${name} in response body`,
                description: `Response body contains a value that matches the ${name} pattern.${isJwt ? ' This may be intentional for auth responses — review carefully.' : ''}`,
                remediation: 'Remove the secret from the response. Rotate any leaked credential immediately.',
                evidence: m[0].slice(0, 8) + '…',
            }));
        }
    }
    return findings;
}

// ─── Check 6: Authentication bypass ──────────────────────────────────

async function checkAuthBypass(target: ExecuteRequest): Promise<Finding[]> {
    const hasAuth = Object.keys(target.headers || {}).some(k => k.toLowerCase() === 'authorization' || k.toLowerCase() === 'cookie' || k.toLowerCase() === 'x-api-key');
    if (!hasAuth) return []; // nothing to strip; skip silently
    const stripped = { ...(target.headers || {}) };
    for (const k of Object.keys(stripped)) {
        const low = k.toLowerCase();
        if (low === 'authorization' || low === 'cookie' || low === 'x-api-key') delete (stripped as any)[k];
    }
    const resp = await safeExec({ ...target, headers: stripped });
    if (!resp) return [];
    // Only flag when the unauthenticated request actually succeeded.
    // Anything 4xx/5xx (including 429 rate-limits) means access was refused.
    if (resp.status < 200 || resp.status >= 300) return [];
    return [finding({
        checkId: 'auth_bypass', check: 'Authentication Bypass',
        severity: 'critical',
        title: `Endpoint accessible without credentials (HTTP ${resp.status})`,
        description: 'The request succeeded after stripping Authorization/Cookie/API-key headers, yet the original request supplied them — suggesting the endpoint does not enforce authentication.',
        remediation: 'Verify the server enforces authentication on this route. Deny unauthenticated requests with 401.',
        evidence: `status=${resp.status}`,
    })];
}

// ─── Check 7: Rate limiting ──────────────────────────────────────────

async function checkRateLimit(target: ExecuteRequest): Promise<Finding[]> {
    const N = 30;
    const responses = await Promise.all(Array.from({ length: N }, () => safeExec({ ...target, timeout: 5000 })));
    const statuses = responses.map(r => r?.status ?? 0);
    const anyLimited = statuses.some(s => s === 429);
    if (anyLimited) return [];
    const okCount = statuses.filter(s => s >= 200 && s < 400).length;
    if (okCount < N) return []; // not all succeeded; server may have other protection
    return [finding({
        checkId: 'rate_limit', check: 'Rate Limiting',
        severity: 'medium',
        title: 'No rate limiting observed',
        description: `Sent ${N} rapid concurrent requests — all succeeded and none returned 429 Too Many Requests.`,
        remediation: 'Apply per-IP / per-token rate limits on sensitive endpoints (login, password reset, expensive reads).',
    })];
}

// ─── Check 8: HTTPS enforcement ──────────────────────────────────────

async function checkHttpsEnforcement(target: ExecuteRequest): Promise<Finding[]> {
    const url = target.url;
    if (url.startsWith('https://')) {
        // Check if http variant also works (should redirect or refuse).
        const httpUrl = 'http://' + url.slice('https://'.length);
        try {
            const resp = await axios({ url: httpUrl, method: target.method || 'GET', timeout: 5000, validateStatus: () => true } as any);
            if (resp.status >= 200 && resp.status < 300) {
                return [finding({
                    checkId: 'https_enforcement', check: 'HTTPS Enforcement',
                    severity: 'medium',
                    title: 'HTTP variant returns 2xx without redirect',
                    description: 'The same endpoint served over plain HTTP returns a successful response instead of redirecting to HTTPS.',
                    remediation: 'Redirect all HTTP traffic to HTTPS (301) and set HSTS.',
                })];
            }
        } catch { /* connection refused — good */ }
        return [];
    }
    return [finding({
        checkId: 'https_enforcement', check: 'HTTPS Enforcement',
        severity: 'medium',
        title: 'Endpoint served over plaintext HTTP',
        description: 'Request target uses http:// — traffic is not encrypted in transit.',
        remediation: 'Serve the endpoint over HTTPS with a valid certificate and redirect HTTP to HTTPS.',
    })];
}

// ─── Orchestrator ────────────────────────────────────────────────────

const CHECKS: Array<{ id: string; label: string; fn: (t: ExecuteRequest) => Promise<Finding[]> }> = [
    { id: 'security_headers', label: 'Security headers', fn: checkSecurityHeaders },
    { id: 'cors_misconfig', label: 'CORS configuration', fn: checkCorsMisconfig },
    { id: 'secret_exposure', label: 'Secret exposure', fn: checkSecretExposure },
    { id: 'https_enforcement', label: 'HTTPS enforcement', fn: checkHttpsEnforcement },
    { id: 'sql_injection', label: 'SQL injection', fn: checkSqlInjection },
    { id: 'xss_reflection', label: 'Reflected XSS', fn: checkXssReflection },
    { id: 'auth_bypass', label: 'Authentication bypass', fn: checkAuthBypass },
    { id: 'rate_limit', label: 'Rate limiting', fn: checkRateLimit },
];

export function startScan(userId: string, config: ScanConfig): ScanRun {
    const id = randomUUID();
    const selected = config.checks.includes('all')
        ? CHECKS
        : CHECKS.filter(c => config.checks.includes(c.id));
    const run: ScanRun = {
        id, userId, config,
        status: 'running',
        startedAt: Date.now(),
        findings: [],
        progress: { completed: 0, total: selected.length },
        emitter: new EventEmitter(),
    };
    runs.set(id, run);

    (async () => {
        for (const check of selected) {
            if (run.status !== 'running') break;
            run.progress.currentCheck = check.label;
            run.emitter.emit('progress', { ...run.progress });
            try {
                const found = await check.fn(config.target);
                for (const f of found) {
                    run.findings.push(f);
                    run.emitter.emit('finding', f);
                }
            } catch (err: any) {
                run.findings.push(finding({
                    checkId: check.id, check: check.label,
                    severity: 'info', title: `${check.label} check failed to run`,
                    description: err?.message || String(err),
                    remediation: 'Re-run the scan. If the failure persists, verify the target is reachable.',
                }));
            }
            run.progress.completed++;
            run.emitter.emit('progress', { ...run.progress });
        }
        run.status = 'completed';
        run.completedAt = Date.now();
        run.emitter.emit('done', run);
    })().catch(err => {
        run.status = 'error';
        run.error = err?.message || String(err);
        run.completedAt = Date.now();
        run.emitter.emit('done', run);
    });

    return run;
}

// ─── Summary / severity counts ───────────────────────────────────────

export function summarise(run: ScanRun) {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of run.findings) counts[f.severity]++;
    return counts;
}
