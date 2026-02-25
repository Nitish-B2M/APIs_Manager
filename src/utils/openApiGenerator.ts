export function generateOpenApiSpec(doc: any, requests: any[], folders: any[]) {
    const spec: any = {
        openapi: '3.0.0',
        info: {
            title: doc.title,
            version: '1.0.0',
            description: 'Exported from Postman Docs'
        },
        servers: [
            {
                url: '/'
            }
        ],
        paths: {},
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        }
    };

    // Build folder map for tagging
    const folderMap = new Map();
    if (folders) {
        folders.forEach(f => folderMap.set(f.id, f.name));
    }

    requests.forEach(req => {
        // Skip WebSockets or SSE for standard OpenAPI (could use AsyncAPI instead, but we'll focus on HTTP)
        if (req.protocol && req.protocol !== 'REST' && req.protocol !== 'GRAPHQL') {
            return;
        }

        // Convert URL to OpenAPI path parameters (e.g., /users/:id -> /users/{id})
        let path = req.url || '/';
        try {
            const urlObj = new URL(req.url, 'http://localhost');
            path = urlObj.pathname;
        } catch (e) {
            // Handle if url is just a path '/api/foo'
            const parts = req.url.split('?');
            path = parts[0];
        }

        // Replace :param with {param} and {{param}} with {param}
        path = path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
        path = path.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, '{$1}');

        if (!path.startsWith('/')) {
            path = '/' + path;
        }

        if (!spec.paths[path]) {
            spec.paths[path] = {};
        }

        const method = (req.method || 'get').toLowerCase();

        const operation: any = {
            summary: req.name || 'Unnamed Request',
            description: req.description || '',
            responses: {
                '200': {
                    description: 'Successful response'
                }
            }
        };

        const tag = req.folderId ? folderMap.get(req.folderId) : undefined;
        if (tag) {
            operation.tags = [tag];
        }

        // Parameters
        const parameters: any[] = [];

        // Path params
        const pathMatches = path.match(/\{([a-zA-Z0-9_]+)\}/g);
        if (pathMatches) {
            pathMatches.forEach((match: string) => {
                const paramName = match.replace(/[{}]/g, '');
                parameters.push({
                    name: paramName,
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                });
            });
        }

        // Query params
        if (req.params && Array.isArray(req.params)) {
            req.params.forEach((p: any) => {
                if (p.type === 'query' && p.key) {
                    parameters.push({
                        name: p.key,
                        in: 'query',
                        required: false,
                        schema: { type: 'string' },
                        example: p.value || ''
                    });
                }
            });
        }

        // Headers
        if (req.headers && Array.isArray(req.headers)) {
            req.headers.forEach((h: any) => {
                if (h.key && h.key.toLowerCase() !== 'content-type' && h.key.toLowerCase() !== 'authorization') {
                    parameters.push({
                        name: h.key,
                        in: 'header',
                        required: false,
                        schema: { type: 'string' },
                        example: h.value || ''
                    });
                }
            });
        }

        if (parameters.length > 0) {
            operation.parameters = parameters;
        }

        // Request Body
        if (req.body && ['post', 'put', 'patch'].includes(method)) {
            let requestBodyContent: any = {};

            if (req.body.mode === 'raw' && req.body.raw) {
                let exampleJson = null;
                try {
                    exampleJson = JSON.parse(req.body.raw);
                } catch {
                    // Not json
                }

                requestBodyContent['application/json'] = {
                    schema: {
                        type: 'object',
                        additionalProperties: true
                    }
                };

                if (exampleJson) {
                    requestBodyContent['application/json'].example = exampleJson;
                }
            } else if (req.body.mode === 'graphql' && req.body.graphql) {
                requestBodyContent['application/json'] = {
                    schema: {
                        type: 'object',
                        properties: {
                            query: { type: 'string' },
                            variables: { type: 'object' }
                        }
                    },
                    example: {
                        query: req.body.graphql.query || '',
                        variables: req.body.graphql.variables ? JSON.parse(req.body.graphql.variables) : {}
                    }
                };
            }

            if (Object.keys(requestBodyContent).length > 0) {
                operation.requestBody = {
                    content: requestBodyContent
                };
            }
        }

        spec.paths[path][method] = operation;
    });

    return spec;
}
