/**
 * Response Schema Validation — validates API responses against JSON Schema.
 * Also auto-generates schemas from response data.
 */

export interface SchemaValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Validate a response body against a JSON Schema (simplified validator).
 */
export function validateSchema(body: any, schema: any): SchemaValidationResult {
    const errors: string[] = [];

    if (!schema || typeof schema !== 'object') {
        return { valid: true, errors: [] };
    }

    validateNode(body, schema, '', errors);
    return { valid: errors.length === 0, errors };
}

function validateNode(value: any, schema: any, path: string, errors: string[]) {
    if (!schema) return;

    // Type check
    if (schema.type) {
        const actualType = getJsonType(value);
        if (schema.type !== actualType) {
            errors.push(`${path || '(root)'}: expected type "${schema.type}", got "${actualType}"`);
            return;
        }
    }

    // Required fields
    if (schema.required && Array.isArray(schema.required) && typeof value === 'object' && value !== null) {
        for (const key of schema.required) {
            if (!(key in value)) {
                errors.push(`${path || '(root)'}: missing required property "${key}"`);
            }
        }
    }

    // Object properties
    if (schema.properties && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (key in value) {
                validateNode(value[key], propSchema, `${path}.${key}`, errors);
            }
        }
    }

    // Array items
    if (schema.items && Array.isArray(value)) {
        value.forEach((item: any, i: number) => {
            validateNode(item, schema.items, `${path}[${i}]`, errors);
        });
    }

    // Enum
    if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`${path || '(root)'}: value "${value}" not in enum [${schema.enum.join(', ')}]`);
    }

    // Min/max for numbers
    if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
        errors.push(`${path}: value ${value} below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) {
        errors.push(`${path}: value ${value} above maximum ${schema.maximum}`);
    }

    // String constraints
    if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
        errors.push(`${path}: string length ${value.length} below minLength ${schema.minLength}`);
    }
    if (schema.pattern !== undefined && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
        errors.push(`${path}: string does not match pattern "${schema.pattern}"`);
    }
}

function getJsonType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value; // 'string', 'number', 'boolean', 'object'
}

/**
 * Auto-generate a JSON Schema from a sample response.
 */
export function generateSchema(value: any): any {
    if (value === null) return { type: 'null' };
    if (Array.isArray(value)) {
        return {
            type: 'array',
            items: value.length > 0 ? generateSchema(value[0]) : {},
        };
    }
    if (typeof value === 'object') {
        const properties: Record<string, any> = {};
        const required: string[] = [];
        for (const [key, val] of Object.entries(value)) {
            properties[key] = generateSchema(val);
            required.push(key);
        }
        return { type: 'object', properties, required };
    }
    return { type: typeof value };
}
