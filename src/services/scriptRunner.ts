/**
 * Pre/Post Request Script Runner — executes user scripts in a sandboxed context.
 * Uses Node.js vm module for isolation.
 */
import * as vm from 'vm';

export interface ScriptResult {
    success: boolean;
    output: string[];
    variables?: Record<string, string>;
    error?: string;
    duration: number;
}

/**
 * Run a user-provided JavaScript script in a sandboxed VM context.
 * Available in the script: pm.variables, pm.response, console.log
 */
export function runScript(
    script: string,
    context: {
        variables?: Record<string, string>;
        response?: { status: number; body: any; headers: Record<string, string>; time: number };
    },
    timeoutMs = 5000
): ScriptResult {
    const startTime = Date.now();
    const output: string[] = [];
    const extractedVars: Record<string, string> = { ...(context.variables || {}) };

    // Build sandboxed pm object (similar to Postman)
    const pm = {
        variables: {
            get: (key: string) => extractedVars[key] || '',
            set: (key: string, value: string) => { extractedVars[key] = String(value); },
            toObject: () => ({ ...extractedVars }),
        },
        response: context.response ? {
            code: context.response.status,
            status: context.response.status,
            json: () => context.response!.body,
            text: () => JSON.stringify(context.response!.body),
            headers: context.response.headers,
            responseTime: context.response.time,
        } : undefined,
        test: (name: string, fn: () => void) => {
            try { fn(); output.push(`✓ ${name}`); } catch (e: any) { output.push(`✗ ${name}: ${e.message}`); }
        },
        expect: (value: any) => ({
            to: {
                equal: (expected: any) => { if (value !== expected) throw new Error(`Expected ${expected}, got ${value}`); },
                be: {
                    a: (type: string) => { if (typeof value !== type) throw new Error(`Expected type ${type}, got ${typeof value}`); },
                    below: (n: number) => { if (value >= n) throw new Error(`Expected < ${n}, got ${value}`); },
                    above: (n: number) => { if (value <= n) throw new Error(`Expected > ${n}, got ${value}`); },
                },
                have: {
                    property: (key: string) => { if (!(key in value)) throw new Error(`Missing property: ${key}`); },
                },
                include: (item: any) => { if (!JSON.stringify(value).includes(String(item))) throw new Error(`Does not include ${item}`); },
                eql: (expected: any) => { if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error(`Deep equal failed`); },
            },
        }),
    };

    const sandbox = {
        pm,
        console: {
            log: (...args: any[]) => output.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
            warn: (...args: any[]) => output.push(`[warn] ${args.join(' ')}`),
            error: (...args: any[]) => output.push(`[error] ${args.join(' ')}`),
        },
        JSON,
        parseInt,
        parseFloat,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Buffer: { from: Buffer.from },
        atob: (s: string) => Buffer.from(s, 'base64').toString('utf8'),
        btoa: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
    };

    try {
        const vmContext = vm.createContext(sandbox);
        vm.runInContext(script, vmContext, { timeout: timeoutMs, filename: 'user-script.js' });

        return {
            success: true,
            output,
            variables: extractedVars,
            duration: Date.now() - startTime,
        };
    } catch (err: any) {
        return {
            success: false,
            output,
            variables: extractedVars,
            error: err.message || 'Script execution failed',
            duration: Date.now() - startTime,
        };
    }
}
