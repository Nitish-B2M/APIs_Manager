/**
 * Auto-generated OpenAPI 3.1 spec from route definitions.
 * Serves at /api/docs (development only).
 */

export function generateOpenAPISpec(): object {
    return {
        openapi: '3.1.0',
        info: {
            title: 'DevManus API',
            version: '1.0.0',
            description: 'API documentation for DevManus Documentation Platform',
        },
        servers: [
            { url: `http://localhost:${process.env.PORT || 4001}`, description: 'Development' },
        ],
        paths: {
            // ─── Auth ────────────────────────────────────
            '/api/auth/register': {
                post: { tags: ['Auth'], summary: 'Register new user', requestBody: jsonBody({ email: 'string', password: 'string' }), responses: r200('token + user') }
            },
            '/api/auth/login': {
                post: { tags: ['Auth'], summary: 'Login', requestBody: jsonBody({ email: 'string', password: 'string' }), responses: r200('token + user') }
            },
            '/api/auth/me': {
                get: { tags: ['Auth'], summary: 'Get current user', security: [bearer()], responses: r200('user profile') }
            },
            '/api/auth/refresh': {
                post: { tags: ['Auth'], summary: 'Refresh access token (uses httpOnly cookie)', responses: r200('new access token') }
            },
            '/api/auth/logout': {
                post: { tags: ['Auth'], summary: 'Logout (revokes refresh token)', responses: r200('logged out') }
            },
            '/api/auth/verify-email': {
                post: { tags: ['Auth'], summary: 'Verify email with token', requestBody: jsonBody({ token: 'string' }), responses: r200('verified') }
            },
            '/api/auth/forgot-password': {
                post: { tags: ['Auth'], summary: 'Request password reset', requestBody: jsonBody({ email: 'string' }), responses: r200('email sent') }
            },

            // ─── Documentation ───────────────────────────
            '/api/documentation/list': {
                get: { tags: ['Documentation'], summary: 'List collections (paginated)', security: [bearer()], parameters: paginationParams(), responses: r200('collections + pagination') }
            },
            '/api/documentation/create-empty': {
                post: { tags: ['Documentation'], summary: 'Create empty collection', security: [bearer()], responses: r200('collection') }
            },
            '/api/documentation/{id}': {
                get: { tags: ['Documentation'], summary: 'Get collection by ID', security: [bearer()], parameters: [pathParam('id')], responses: r200('collection with requests') },
                patch: { tags: ['Documentation'], summary: 'Update collection', security: [bearer()], parameters: [pathParam('id')], responses: r200('updated') },
                delete: { tags: ['Documentation'], summary: 'Delete collection', security: [bearer()], parameters: [pathParam('id')], responses: r200('deleted') },
            },

            // ─── Requests ────────────────────────────────
            '/api/documentation/{id}/request': {
                post: { tags: ['Requests'], summary: 'Create request in collection', security: [bearer()], responses: r200('request') }
            },
            '/api/documentation/request/{id}': {
                patch: { tags: ['Requests'], summary: 'Update request (supports optimistic concurrency)', security: [bearer()], responses: r200('updated request') },
                delete: { tags: ['Requests'], summary: 'Delete request', security: [bearer()], responses: r200('deleted') },
            },
            '/api/documentation/request/{id}/history': {
                get: { tags: ['Requests'], summary: 'Get request history (paginated)', security: [bearer()], parameters: [...paginationParams(), pathParam('id')], responses: r200('history entries') },
                delete: { tags: ['Requests'], summary: 'Clear request history', security: [bearer()], responses: r200('cleared') },
            },

            // ─── Execute ─────────────────────────────────
            '/api/execute': {
                post: { tags: ['Execute'], summary: 'Execute REST/GraphQL/WS/SSE request', security: [bearer()], requestBody: jsonBody({ url: 'string', method: 'string', protocol: 'REST|GRAPHQL|WS|SSE' }), responses: r200('response + test results') }
            },
            '/api/execute/graphql/introspect': {
                post: { tags: ['Execute'], summary: 'Introspect GraphQL schema', security: [bearer()], responses: r200('schema') }
            },
            '/api/execute/collection': {
                post: { tags: ['Execute'], summary: 'Run collection of requests', security: [bearer()], responses: r200('results + summary') }
            },

            // ─── Workspaces ──────────────────────────────
            '/api/workspaces': {
                get: { tags: ['Workspaces'], summary: 'List workspaces', security: [bearer()], responses: r200('workspaces') },
                post: { tags: ['Workspaces'], summary: 'Create workspace', security: [bearer()], responses: r200('workspace') },
            },

            // ─── Tags ────────────────────────────────────
            '/api/tags': {
                get: { tags: ['Tags'], summary: 'List tags', security: [bearer()], responses: r200('tags with usage count') },
                post: { tags: ['Tags'], summary: 'Create tag', security: [bearer()], requestBody: jsonBody({ name: 'string', color: '#hex' }), responses: r200('tag') },
            },

            // ─── Search ──────────────────────────────────
            '/api/search': {
                get: { tags: ['Search'], summary: 'Full-text search', security: [bearer()], parameters: [queryParam('q', 'Search query'), queryParam('type', 'all|collection|request|note')], responses: r200('results by type') }
            },

            // ─── Notifications ───────────────────────────
            '/api/notifications': {
                get: { tags: ['Notifications'], summary: 'List notifications (paginated)', security: [bearer()], responses: r200('notifications + unread count') },
            },

            // ─── Comments ────────────────────────────────
            '/api/comments/{requestId}': {
                get: { tags: ['Comments'], summary: 'List comments for request', security: [bearer()], responses: r200('threaded comments') },
                post: { tags: ['Comments'], summary: 'Add comment', security: [bearer()], requestBody: jsonBody({ content: 'string', parentId: 'uuid?' }), responses: r200('comment') },
            },

            // ─── Health ──────────────────────────────────
            '/api/health': {
                get: { tags: ['System'], summary: 'Health check with DB stats', responses: r200('health status + database + memory') }
            },
        },
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
        },
    };
}

// Helpers
function bearer() { return { bearerAuth: [] }; }
function jsonBody(example: any) { return { content: { 'application/json': { schema: { type: 'object', example } } } }; }
function r200(desc: string) { return { '200': { description: desc }, '401': { description: 'Unauthorized' }, '500': { description: 'Server error' } }; }
function pathParam(name: string) { return { name, in: 'path', required: true, schema: { type: 'string' } }; }
function queryParam(name: string, desc: string) { return { name, in: 'query', description: desc, schema: { type: 'string' } }; }
function paginationParams() { return [queryParam('page', 'Page number'), queryParam('limit', 'Items per page'), queryParam('sortBy', 'Sort field'), queryParam('sortOrder', 'ASC or DESC')]; }

/**
 * Swagger UI HTML page — serves at /api/docs in development.
 */
export function getSwaggerHTML(): string {
    return `<!DOCTYPE html>
<html><head>
    <title>DevManus API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>SwaggerUIBundle({ url: '/api/docs/spec.json', dom_id: '#swagger-ui', deepLinking: true });</script>
</body></html>`;
}
