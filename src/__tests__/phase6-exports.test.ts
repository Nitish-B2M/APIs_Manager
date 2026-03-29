import { describe, it, expect } from 'vitest';

describe('JUnit XML Export', () => {
    it('generates valid JUnit XML', async () => {
        const { generateJUnitXML } = await import('../services/exportService');
        const xml = generateJUnitXML([{
            name: 'API Tests',
            tests: 3,
            passed: 2,
            failed: 1,
            duration: 1500,
            testCases: [
                { name: 'GET /users returns 200', passed: true, message: 'OK', duration: 150 },
                { name: 'POST /users creates user', passed: true, message: 'OK', duration: 300 },
                { name: 'DELETE /users returns 404', passed: false, message: 'Expected 404, got 200', duration: 100 },
            ],
        }]);

        expect(xml).toContain('<?xml');
        expect(xml).toContain('<testsuites');
        expect(xml).toContain('tests="3"');
        expect(xml).toContain('failures="1"');
        expect(xml).toContain('GET /users returns 200');
        expect(xml).toContain('<failure');
    });

    it('handles multiple test suites', async () => {
        const { generateJUnitXML } = await import('../services/exportService');
        const xml = generateJUnitXML([
            { name: 'Suite 1', tests: 1, passed: 1, failed: 0, duration: 100, testCases: [{ name: 'test1', passed: true, message: '', duration: 100 }] },
            { name: 'Suite 2', tests: 1, passed: 0, failed: 1, duration: 200, testCases: [{ name: 'test2', passed: false, message: 'fail', duration: 200 }] },
        ]);

        expect(xml).toContain('Suite 1');
        expect(xml).toContain('Suite 2');
        expect(xml).toContain('tests="2"');
        expect(xml).toContain('failures="1"');
    });
});

describe('Health Report Export', () => {
    it('generates HTML health report', async () => {
        const { generateHealthReport } = await import('../services/exportService');
        const html = generateHealthReport([
            { name: 'API Server', url: 'https://api.test.com/health', uptime: 99.95, avgResponseTime: 120, checks: 1440, failures: 2, lastCheck: new Date().toISOString() },
            { name: 'Auth Service', url: 'https://auth.test.com/health', uptime: 100, avgResponseTime: 50, checks: 720, failures: 0, lastCheck: new Date().toISOString() },
        ]);

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('API Server');
        expect(html).toContain('99.95%');
        expect(html).toContain('120ms');
        expect(html).toContain('class="good"'); // 99.95% is good
    });
});

describe('XML Escaping', () => {
    it('escapes special characters in JUnit output', async () => {
        const { generateJUnitXML } = await import('../services/exportService');
        const xml = generateJUnitXML([{
            name: 'Test <special> & "chars"',
            tests: 1, passed: 0, failed: 1, duration: 100,
            testCases: [{ name: 'test with <html> & "quotes"', passed: false, message: 'Expected <value>', duration: 100 }],
        }]);

        expect(xml).toContain('&lt;special&gt;');
        expect(xml).toContain('&amp;');
        expect(xml).toContain('&quot;');
        expect(xml).not.toContain('<<'); // No raw unescaped brackets
    });
});
