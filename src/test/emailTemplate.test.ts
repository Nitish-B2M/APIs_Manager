import { expect, test, describe } from 'vitest';
import { parseTemplate } from '../utils/email';

describe('Email Template Variable Parsing', () => {
    test('should replace multiple variables in a string', () => {
        const template = 'Hello {{username}}, welcome to {{projectName}}!';
        const vars = { username: 'Alice', projectName: 'Antigravity' };
        expect(parseTemplate(template, vars)).toBe('Hello Alice, welcome to Antigravity!');
    });

    test('should leave unresolved variables as is', () => {
        const template = 'Hello {{username}}, from {{unresolved}}!';
        const vars = { username: 'Alice' };
        expect(parseTemplate(template, vars)).toBe('Hello Alice, from {{unresolved}}!');
    });

    test('should handle variables with underscores and numbers', () => {
        const template = 'Your code is {{code_123}}';
        const vars = { code_123: '9876' };
        expect(parseTemplate(template, vars)).toBe('Your code is 9876');
    });

    test('should handle empty variables object', () => {
        const template = 'No change {{here}}';
        expect(parseTemplate(template, {})).toBe('No change {{here}}');
    });

    test('should handle multiple occurrences of the same variable', () => {
        const template = '{{name}} is {{name}}';
        const vars = { name: 'Batman' };
        expect(parseTemplate(template, vars)).toBe('Batman is Batman');
    });
});
