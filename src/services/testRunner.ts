/**
 * Test Runner Engine — executes assertions against API responses.
 * Supports: status_code, response_time, body_contains, json_value
 */

export interface Assertion {
    id: string;
    type: 'status_code' | 'response_time' | 'body_contains' | 'json_value';
    expected: string;
    property?: string; // dot-path for json_value
}

export interface TestResult {
    assertionId: string;
    name: string;
    passed: boolean;
    message: string;
    actual?: string;
}

export interface TestReport {
    total: number;
    passed: number;
    failed: number;
    results: TestResult[];
    duration: number;
}

/**
 * Run all assertions against a response.
 */
export function runAssertions(
    assertions: Assertion[],
    response: {
        status: number;
        time: number;
        body: any;
        bodyText: string;
    }
): TestReport {
    const startTime = Date.now();
    const results: TestResult[] = [];

    for (const assertion of assertions) {
        results.push(executeAssertion(assertion, response));
    }

    return {
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        results,
        duration: Date.now() - startTime,
    };
}

function executeAssertion(
    assertion: Assertion,
    response: { status: number; time: number; body: any; bodyText: string }
): TestResult {
    const base = { assertionId: assertion.id };

    switch (assertion.type) {
        case 'status_code': {
            const expected = parseInt(assertion.expected, 10);
            const passed = response.status === expected;
            return {
                ...base,
                name: `Status code is ${assertion.expected}`,
                passed,
                message: passed ? `Status ${response.status} matches` : `Expected ${expected}, got ${response.status}`,
                actual: String(response.status),
            };
        }

        case 'response_time': {
            const maxMs = parseInt(assertion.expected, 10);
            const passed = response.time <= maxMs;
            return {
                ...base,
                name: `Response time < ${assertion.expected}ms`,
                passed,
                message: passed ? `${response.time}ms within limit` : `${response.time}ms exceeded ${maxMs}ms limit`,
                actual: String(response.time),
            };
        }

        case 'body_contains': {
            const passed = response.bodyText.includes(assertion.expected);
            return {
                ...base,
                name: `Body contains "${assertion.expected.substring(0, 50)}"`,
                passed,
                message: passed ? 'Found in response body' : `"${assertion.expected.substring(0, 50)}" not found in body`,
            };
        }

        case 'json_value': {
            try {
                const actual = getNestedValue(response.body, assertion.property || '');
                const actualStr = JSON.stringify(actual);
                const passed = actualStr === assertion.expected || String(actual) === assertion.expected;
                return {
                    ...base,
                    name: `${assertion.property} equals ${assertion.expected.substring(0, 30)}`,
                    passed,
                    message: passed ? 'Value matches' : `Expected ${assertion.expected.substring(0, 30)}, got ${actualStr?.substring(0, 30)}`,
                    actual: actualStr,
                };
            } catch {
                return {
                    ...base,
                    name: `${assertion.property} equals ${assertion.expected.substring(0, 30)}`,
                    passed: false,
                    message: `Failed to read property "${assertion.property}" from response`,
                };
            }
        }

        default:
            return {
                ...base,
                name: `Unknown assertion type: ${assertion.type}`,
                passed: false,
                message: 'Unsupported assertion type',
            };
    }
}

/**
 * Access a nested value by dot-path: "data.user.name" → obj.data.user.name
 */
function getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
        if (current === null || current === undefined) return undefined;
        return current[key];
    }, obj);
}
