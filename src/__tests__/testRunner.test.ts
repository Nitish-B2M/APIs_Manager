import { describe, it, expect } from 'vitest';
import { runAssertions } from '../services/testRunner';

const mockResponse = {
    status: 200,
    time: 150,
    body: { data: { user: { name: 'John', age: 30 }, items: [1, 2, 3] } },
    bodyText: '{"data":{"user":{"name":"John","age":30},"items":[1,2,3]}}',
};

describe('Test Runner Engine', () => {
    it('passes status_code assertion when matching', () => {
        const report = runAssertions(
            [{ id: '1', type: 'status_code', expected: '200' }],
            mockResponse
        );
        expect(report.passed).toBe(1);
        expect(report.failed).toBe(0);
        expect(report.results[0].passed).toBe(true);
    });

    it('fails status_code assertion when not matching', () => {
        const report = runAssertions(
            [{ id: '1', type: 'status_code', expected: '201' }],
            mockResponse
        );
        expect(report.failed).toBe(1);
        expect(report.results[0].passed).toBe(false);
        expect(report.results[0].actual).toBe('200');
    });

    it('passes response_time assertion when within limit', () => {
        const report = runAssertions(
            [{ id: '1', type: 'response_time', expected: '500' }],
            mockResponse
        );
        expect(report.results[0].passed).toBe(true);
    });

    it('fails response_time assertion when exceeding limit', () => {
        const report = runAssertions(
            [{ id: '1', type: 'response_time', expected: '100' }],
            mockResponse
        );
        expect(report.results[0].passed).toBe(false);
    });

    it('passes body_contains assertion when text found', () => {
        const report = runAssertions(
            [{ id: '1', type: 'body_contains', expected: 'John' }],
            mockResponse
        );
        expect(report.results[0].passed).toBe(true);
    });

    it('fails body_contains when text not found', () => {
        const report = runAssertions(
            [{ id: '1', type: 'body_contains', expected: 'NotExists' }],
            mockResponse
        );
        expect(report.results[0].passed).toBe(false);
    });

    it('passes json_value assertion with dot-path', () => {
        const report = runAssertions(
            [{ id: '1', type: 'json_value', expected: '"John"', property: 'data.user.name' }],
            mockResponse
        );
        expect(report.results[0].passed).toBe(true);
    });

    it('passes json_value for number', () => {
        const report = runAssertions(
            [{ id: '1', type: 'json_value', expected: '30', property: 'data.user.age' }],
            mockResponse
        );
        expect(report.results[0].passed).toBe(true);
    });

    it('fails json_value when value differs', () => {
        const report = runAssertions(
            [{ id: '1', type: 'json_value', expected: '"Jane"', property: 'data.user.name' }],
            mockResponse
        );
        expect(report.results[0].passed).toBe(false);
    });

    it('handles non-existent json path gracefully', () => {
        const report = runAssertions(
            [{ id: '1', type: 'json_value', expected: 'anything', property: 'data.nonexistent.deep' }],
            mockResponse
        );
        expect(report.results[0].passed).toBe(false);
    });

    it('runs multiple assertions and generates correct report', () => {
        const report = runAssertions(
            [
                { id: '1', type: 'status_code', expected: '200' },
                { id: '2', type: 'response_time', expected: '500' },
                { id: '3', type: 'body_contains', expected: 'John' },
                { id: '4', type: 'json_value', expected: '"John"', property: 'data.user.name' },
                { id: '5', type: 'status_code', expected: '404' }, // This should fail
            ],
            mockResponse
        );
        expect(report.total).toBe(5);
        expect(report.passed).toBe(4);
        expect(report.failed).toBe(1);
        expect(report.duration).toBeGreaterThanOrEqual(0);
    });
});
