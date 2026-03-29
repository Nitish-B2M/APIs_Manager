/**
 * Export Service — generates various export formats.
 * Supports: HTML doc site, JUnit XML test reports, monitor health reports.
 */

// Doc site generation available via: import { generateDocSite } from './docSiteGenerator'

// ─── JUnit XML Test Report ──────────────────────────────────────────

export interface TestSuiteResult {
    name: string;
    tests: number;
    passed: number;
    failed: number;
    duration: number;
    testCases: Array<{
        name: string;
        passed: boolean;
        message: string;
        duration: number;
    }>;
}

export function generateJUnitXML(suites: TestSuiteResult[]): string {
    const totalTests = suites.reduce((sum, s) => sum + s.tests, 0);
    const totalFailures = suites.reduce((sum, s) => sum + s.failed, 0);
    const totalTime = suites.reduce((sum, s) => sum + s.duration, 0);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<testsuites tests="${totalTests}" failures="${totalFailures}" time="${(totalTime / 1000).toFixed(3)}">\n`;

    for (const suite of suites) {
        xml += `  <testsuite name="${escapeXml(suite.name)}" tests="${suite.tests}" failures="${suite.failed}" time="${(suite.duration / 1000).toFixed(3)}">\n`;
        for (const tc of suite.testCases) {
            xml += `    <testcase name="${escapeXml(tc.name)}" time="${(tc.duration / 1000).toFixed(3)}"`;
            if (tc.passed) {
                xml += ` />\n`;
            } else {
                xml += `>\n      <failure message="${escapeXml(tc.message)}" />\n    </testcase>\n`;
            }
        }
        xml += `  </testsuite>\n`;
    }

    xml += `</testsuites>`;
    return xml;
}

// ─── Monitor Health Report ───────────────────────────────────────────

export interface MonitorReport {
    name: string;
    url: string;
    uptime: number; // percentage
    avgResponseTime: number;
    checks: number;
    failures: number;
    lastCheck: string;
}

export function generateHealthReport(monitors: MonitorReport[]): string {
    const now = new Date().toISOString();
    let html = `<!DOCTYPE html><html><head><title>Monitor Health Report</title>
    <style>
        body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #333; }
        h1 { border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f9fafb; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
        .good { color: #22c55e; font-weight: 700; }
        .warn { color: #f59e0b; font-weight: 700; }
        .bad { color: #ef4444; font-weight: 700; }
        footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
    </style></head><body>
    <h1>Monitor Health Report</h1>
    <p>Generated: ${now}</p>
    <table>
        <tr><th>Monitor</th><th>URL</th><th>Uptime</th><th>Avg Response</th><th>Checks</th><th>Failures</th></tr>`;

    for (const m of monitors) {
        const uptimeClass = m.uptime >= 99.9 ? 'good' : m.uptime >= 95 ? 'warn' : 'bad';
        html += `<tr>
            <td><strong>${m.name}</strong></td>
            <td><code>${m.url}</code></td>
            <td class="${uptimeClass}">${m.uptime.toFixed(2)}%</td>
            <td>${m.avgResponseTime}ms</td>
            <td>${m.checks}</td>
            <td>${m.failures}</td>
        </tr>`;
    }

    html += `</table><footer>DevManus Documentation Platform — Monitor Health Report</footer></body></html>`;
    return html;
}

// ─── HTML Doc Site Export (reuses docSiteGenerator) ──────────────────

export { generateDocSite } from './docSiteGenerator';

// ─── Helpers ─────────────────────────────────────────────────────────

function escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
