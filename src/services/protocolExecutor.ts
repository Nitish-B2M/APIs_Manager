/**
 * Protocol Executor — executes HTTP/GraphQL/WebSocket/SSE requests server-side.
 * Used by the API client and collection runner.
 */

import axios from 'axios';
import * as WebSocket from 'ws';
import * as http from 'http';
import * as https from 'https';

// ─── Types ───────────────────────────────────────────────────────────

export interface ExecuteRequest {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: any;
    timeout?: number;
    protocol?: 'REST' | 'GRAPHQL' | 'WS' | 'SSE';
    // GraphQL specific
    graphql?: {
        query: string;
        variables?: string;
        operationName?: string;
    };
}

export interface ExecuteResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
    bodyText: string;
    time: number;
    size: number;
}

// ─── REST Execution ──────────────────────────────────────────────────

export async function executeRest(req: ExecuteRequest): Promise<ExecuteResponse> {
    const start = Date.now();

    const config: any = {
        url: req.url,
        method: req.method || 'GET',
        headers: req.headers || {},
        timeout: req.timeout || 30000,
        validateStatus: () => true, // Don't throw on 4xx/5xx
        maxRedirects: 5,
    };

    if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
        config.data = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await axios(config);
    const time = Date.now() - start;
    const bodyText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
        body: response.data,
        bodyText,
        time,
        size: Buffer.byteLength(bodyText, 'utf8'),
    };
}

// ─── GraphQL Execution ───────────────────────────────────────────────

export async function executeGraphQL(req: ExecuteRequest): Promise<ExecuteResponse> {
    const gql = req.graphql;
    if (!gql?.query) {
        throw new Error('GraphQL query is required');
    }

    let variables = {};
    if (gql.variables) {
        try {
            variables = JSON.parse(gql.variables);
        } catch {
            throw new Error('Invalid GraphQL variables JSON');
        }
    }

    const gqlBody = {
        query: gql.query,
        variables,
        ...(gql.operationName ? { operationName: gql.operationName } : {}),
    };

    return executeRest({
        url: req.url,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...req.headers,
        },
        body: gqlBody,
        timeout: req.timeout,
    });
}

/**
 * Introspect a GraphQL endpoint — fetches the schema.
 */
export async function introspectGraphQL(url: string, headers?: Record<string, string>): Promise<ExecuteResponse> {
    const introspectionQuery = `
        query IntrospectionQuery {
            __schema {
                queryType { name }
                mutationType { name }
                subscriptionType { name }
                types {
                    kind name description
                    fields(includeDeprecated: true) {
                        name description
                        args { name description type { ...TypeRef } defaultValue }
                        type { ...TypeRef }
                        isDeprecated deprecationReason
                    }
                    inputFields { name description type { ...TypeRef } defaultValue }
                    interfaces { ...TypeRef }
                    enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
                    possibleTypes { ...TypeRef }
                }
                directives {
                    name description
                    locations
                    args { name description type { ...TypeRef } defaultValue }
                }
            }
        }
        fragment TypeRef on __Type {
            kind name
            ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
        }
    `;

    return executeGraphQL({
        url,
        method: 'POST',
        headers,
        graphql: { query: introspectionQuery },
    });
}

// ─── WebSocket Execution ─────────────────────────────────────────────

export interface WsMessage {
    type: 'sent' | 'received' | 'error' | 'status';
    data: string;
    timestamp: string;
}

/**
 * Opens a WebSocket connection, sends a message, collects responses.
 * Returns after `collectMs` milliseconds or `maxMessages` received.
 */
export async function executeWebSocket(
    url: string,
    message?: string,
    headers?: Record<string, string>,
    collectMs = 5000,
    maxMessages = 50
): Promise<{ messages: WsMessage[]; connected: boolean; error?: string }> {
    return new Promise((resolve) => {
        const messages: WsMessage[] = [];
        let connected = false;

        const wsUrl = url.replace(/^http/, 'ws');
        const ws = new WebSocket.WebSocket(wsUrl, { headers: headers || {} });

        const timeout = setTimeout(() => {
            ws.close();
            resolve({ messages, connected });
        }, collectMs);

        ws.on('open', () => {
            connected = true;
            messages.push({ type: 'status', data: 'Connected', timestamp: new Date().toISOString() });

            if (message) {
                ws.send(message);
                messages.push({ type: 'sent', data: message, timestamp: new Date().toISOString() });
            }
        });

        ws.on('message', (data) => {
            messages.push({ type: 'received', data: data.toString(), timestamp: new Date().toISOString() });
            if (messages.length >= maxMessages) {
                clearTimeout(timeout);
                ws.close();
                resolve({ messages, connected });
            }
        });

        ws.on('error', (err) => {
            messages.push({ type: 'error', data: err.message, timestamp: new Date().toISOString() });
            clearTimeout(timeout);
            resolve({ messages, connected, error: err.message });
        });

        ws.on('close', () => {
            messages.push({ type: 'status', data: 'Disconnected', timestamp: new Date().toISOString() });
            clearTimeout(timeout);
            resolve({ messages, connected });
        });
    });
}

// ─── SSE Execution ───────────────────────────────────────────────────

export interface SseEvent {
    event?: string;
    data: string;
    id?: string;
    timestamp: string;
}

/**
 * Connect to an SSE endpoint, collect events for `collectMs` milliseconds.
 */
export async function executeSSE(
    url: string,
    headers?: Record<string, string>,
    collectMs = 5000,
    maxEvents = 50
): Promise<{ events: SseEvent[]; error?: string }> {
    return new Promise((resolve) => {
        const events: SseEvent[] = [];
        const lib = url.startsWith('https') ? https : http;
        const parsedUrl = new URL(url);

        const reqOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: {
                Accept: 'text/event-stream',
                'Cache-Control': 'no-cache',
                ...headers,
            },
        };

        const timeout = setTimeout(() => {
            req.destroy();
            resolve({ events });
        }, collectMs);

        const req = lib.get(reqOptions, (res) => {
            let buffer = '';

            res.on('data', (chunk: Buffer) => {
                buffer += chunk.toString();

                // Parse SSE format: "event: ...\ndata: ...\nid: ...\n\n"
                const parts = buffer.split('\n\n');
                buffer = parts.pop() || ''; // Keep incomplete last part

                for (const part of parts) {
                    if (!part.trim()) continue;
                    const evt: SseEvent = { data: '', timestamp: new Date().toISOString() };

                    for (const line of part.split('\n')) {
                        if (line.startsWith('event:')) evt.event = line.substring(6).trim();
                        else if (line.startsWith('data:')) evt.data += (evt.data ? '\n' : '') + line.substring(5).trim();
                        else if (line.startsWith('id:')) evt.id = line.substring(3).trim();
                    }

                    if (evt.data) {
                        events.push(evt);
                        if (events.length >= maxEvents) {
                            clearTimeout(timeout);
                            req.destroy();
                            resolve({ events });
                            return;
                        }
                    }
                }
            });

            res.on('end', () => {
                clearTimeout(timeout);
                resolve({ events });
            });
        });

        req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ events, error: err.message });
        });
    });
}
