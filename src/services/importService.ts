/**
 * Import Service — parse collections from multiple formats.
 * Supports: Insomnia, HAR, OpenAPI (partial), Thunder Client, bulk URLs.
 */

export interface ImportedRequest {
    name: string;
    method: string;
    url: string;
    headers: Array<{ key: string; value: string }>;
    body?: any;
    description?: string;
}

export interface ImportResult {
    requests: ImportedRequest[];
    name: string;
    format: string;
    errors: string[];
}

/**
 * Detect format and parse accordingly.
 */
export function parseImport(content: string, _filename?: string): ImportResult {
    const trimmed = content.trim();

    // Try JSON first
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const json = JSON.parse(trimmed);

            // Insomnia v4 format
            if (json.__export_format === 4 || json._type === 'export') {
                return parseInsomnia(json);
            }

            // HAR format
            if (json.log?.entries) {
                return parseHAR(json);
            }

            // OpenAPI/Swagger
            if (json.openapi || json.swagger) {
                return parseOpenAPI(json);
            }

            // Thunder Client
            if (json.client === 'Thunder Client' || json.requests) {
                return parseThunderClient(json);
            }

            // Postman collection
            if (json.info?.schema?.includes('postman')) {
                return { requests: [], name: json.info?.name || 'Postman Import', format: 'postman', errors: ['Use the dedicated Postman import feature'] };
            }
        } catch {
            return { requests: [], name: 'Unknown', format: 'unknown', errors: ['Failed to parse JSON'] };
        }
    }

    // Bulk URLs (one per line)
    if (trimmed.includes('\n') && trimmed.split('\n').every(l => !l.trim() || l.trim().startsWith('http'))) {
        return parseBulkUrls(trimmed);
    }

    return { requests: [], name: 'Unknown', format: 'unknown', errors: ['Unrecognized import format'] };
}

function parseInsomnia(data: any): ImportResult {
    const requests: ImportedRequest[] = [];
    const errors: string[] = [];
    const resources = data.resources || [];

    for (const res of resources) {
        if (res._type !== 'request') continue;
        try {
            requests.push({
                name: res.name || 'Unnamed',
                method: res.method || 'GET',
                url: res.url || '',
                headers: (res.headers || []).map((h: any) => ({ key: h.name, value: h.value })),
                body: res.body?.text || res.body?.params || undefined,
                description: res.description,
            });
        } catch (e: any) {
            errors.push(`Failed to parse request: ${res.name || 'unknown'}`);
        }
    }

    return { requests, name: data.name || 'Insomnia Import', format: 'insomnia', errors };
}

function parseHAR(data: any): ImportResult {
    const requests: ImportedRequest[] = [];
    const entries = data.log?.entries || [];

    for (const entry of entries) {
        const req = entry.request;
        if (!req?.url) continue;

        requests.push({
            name: new URL(req.url).pathname || req.url,
            method: req.method || 'GET',
            url: req.url,
            headers: (req.headers || []).filter((h: any) => !h.name.startsWith(':')).map((h: any) => ({ key: h.name, value: h.value })),
            body: req.postData?.text || undefined,
        });
    }

    return { requests, name: 'HAR Import', format: 'har', errors: [] };
}

function parseOpenAPI(data: any): ImportResult {
    const requests: ImportedRequest[] = [];
    const basePath = data.servers?.[0]?.url || '';
    const paths = data.paths || {};

    for (const [path, methods] of Object.entries(paths as Record<string, any>)) {
        for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
            if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                requests.push({
                    name: operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`,
                    method: method.toUpperCase(),
                    url: `${basePath}${path}`,
                    headers: [],
                    description: operation.description,
                });
            }
        }
    }

    return { requests, name: data.info?.title || 'OpenAPI Import', format: 'openapi', errors: [] };
}

function parseThunderClient(data: any): ImportResult {
    const requests: ImportedRequest[] = [];
    const items = data.requests || data.collections?.[0]?.requests || [];

    for (const item of items) {
        requests.push({
            name: item.name || item.colName || 'Unnamed',
            method: item.method || 'GET',
            url: item.url || '',
            headers: (item.headers || []).map((h: any) => ({ key: h.name || h.key, value: h.value })),
            body: item.body?.raw || item.body?.text || undefined,
        });
    }

    return { requests, name: 'Thunder Client Import', format: 'thunder-client', errors: [] };
}

function parseBulkUrls(content: string): ImportResult {
    const urls = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
    const requests: ImportedRequest[] = urls.map((url, i) => ({
        name: `Request ${i + 1}`,
        method: 'GET',
        url,
        headers: [],
    }));

    return { requests, name: 'Bulk URL Import', format: 'bulk-urls', errors: [] };
}
