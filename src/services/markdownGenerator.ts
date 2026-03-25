export interface DevManusItem {
    name: string;
    item?: DevManusItem[];
    request?: {
        method: string;
        url: { raw: string; host?: string[]; path?: string[] } | string;
        header?: { key: string; value: string; description?: string }[];
        body?: { mode: string; raw?: string; formdata?: any[] };
        description?: string;
    };
    response?: any[];
}

export interface Endpoint {
    name: string;
    method: string;
    url: string;
    folder: string;
    headers: { key: string; value: string; description?: string }[];
    body: any;
    description: string;
    protocol: string;
    response: any[];
}

// Extract API endpoints from collection (Logic from devmanus-doc-gen.tsx)
export const extractEndpoints = (items: DevManusItem[], parentFolder = ''): Endpoint[] => {
    const endpoints: Endpoint[] = [];

    items.forEach(item => {
        if (item.request) {
            let url = '';
            const reqUrl = item.request.url;
            if (typeof reqUrl === 'string') {
                url = reqUrl;
            } else if (reqUrl?.raw) {
                url = reqUrl.raw;
            }

            endpoints.push({
                name: item.name,
                method: item.request.method,
                url: url,
                folder: parentFolder,
                headers: item.request.header || [],
                body: item.request.body,
                description: item.request.description || '',
                protocol: 'REST', // Default to REST for DevManus imports for now
                response: item.response || []
            });
        }
        if (item.item) {
            endpoints.push(...extractEndpoints(item.item, item.name));
        }
    });

    return endpoints;
};

export const generateMarkdown = (endpoints: Endpoint[], collectionName: string): string => {
    let markdown = `${collectionName} endpoints\n\n`;
    markdown += `Endpoints\n`;

    endpoints.forEach((endpoint, index) => {
        markdown += `${index + 1}. ${endpoint.name}\n`;
        markdown += `- Name: ${endpoint.name}\n`;
        markdown += `- Method: ${endpoint.method}\n`;
        markdown += `- URL: ${endpoint.url}\n\n`;

        // Payload
        if (endpoint.body?.raw) {
            markdown += `- Payload:\n`;
            markdown += '```JSON\n';
            try {
                const parsed = JSON.parse(endpoint.body.raw);
                markdown += '  ' + JSON.stringify(parsed, null, 2).replace(/\n/g, '\n  ') + '\n';
            } catch (e) {
                markdown += '  ' + endpoint.body.raw + '\n';
            }
            markdown += '```\n\n';
        }

        // Response
        if (endpoint.response && endpoint.response.length > 0) {
            const example = endpoint.response[0];
            markdown += `- Status code: ${example.code || '200'} ${example.status || 'OK'}\n`;
            markdown += `- Response body:\n`;
            markdown += '```JSON\n';
            if (example.body) {
                try {
                    const parsed = JSON.parse(example.body);
                    markdown += '  ' + JSON.stringify(parsed, null, 2).replace(/\n/g, '\n  ') + '\n';
                } catch (e) {
                    markdown += '  ' + example.body + '\n';
                }
            }
            markdown += '```\n\n';
        } else {
            markdown += `- Status code: 200 OK\n`;
            markdown += `- Response body:\n`;
            markdown += '```JSON\n  {\n    "status": true,\n    "message": "Success",\n    "data": {}\n  }\n```\n\n';
        }
    });

    return markdown;
};
