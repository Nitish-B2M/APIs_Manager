function parseUrl(url: string, protocolHint: string = 'http') {
    if (!url) return { raw: '', host: [], path: [] };

    let protocol: string | undefined = protocolHint.toLowerCase();
    let remaining = url;
    
    // Explicitly handle protocol if found
    if (url.includes('://')) {
        const parts = url.split('://');
        protocol = parts[0].toLowerCase();
        remaining = parts[1];
    } else if (url.startsWith('{{')) {
        // Variable-based URL usually has no explicit protocol in the string
        protocol = undefined; 
    }

    const firstSlash = remaining.indexOf('/');
    let hostStr = firstSlash === -1 ? remaining : remaining.substring(0, firstSlash);
    let pathStr = firstSlash === -1 ? '' : remaining.substring(firstSlash + 1);

    // Host and Port
    const hostParts = hostStr.split(':');
    const host = hostParts[0] ? [hostParts[0]] : [];
    const port = hostParts[1] || undefined;

    // Handle Query Params in pathStr
    const query: any[] = [];
    const questionMark = pathStr.indexOf('?');
    if (questionMark !== -1) {
        const queryStr = pathStr.substring(questionMark + 1);
        pathStr = pathStr.substring(0, questionMark);
        queryStr.split('&').forEach(q => {
            const [key, value] = q.split('=');
            if (key) query.push({ key, value: value || '' });
        });
    }

    // Path parts
    const path = pathStr.split('/').filter(p => p !== '');

    // Variable extraction (:id)
    const variables: any[] = [];
    path.forEach(p => {
        if (p.startsWith(':')) {
            variables.push({ 
                key: p.substring(1), 
                value: '' 
            });
        }
    });

    return {
        raw: url,
        protocol: protocol,
        host,
        port,
        path,
        query: query.length > 0 ? query : undefined,
        variable: variables.length > 0 ? variables : undefined
    };
}

export function generatePostmanCollection(doc: any, requests: any[], folders: any[]) {
    const collection: any = {
        info: {
            _postman_id: doc.id,
            name: doc.title,
            description: doc.description || 'Exported from DevManus Docs',
            schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
        },
        item: [],
        variable: [
            {
                key: "URL",
                value: "",
                type: "default"
            }
        ]
    };

    // Build folder tree
    const folderMap = new Map();
    folders.forEach(f => {
        folderMap.set(f.id, {
            name: f.name,
            item: [],
            description: f.description || '',
            _id: f.id,
            _parentId: f.parentId || f.parent_id
        });
    });

    // Add folders to parents or root
    const rootFolders: any[] = [];
    folderMap.forEach(f => {
        if (f._parentId && folderMap.has(f._parentId)) {
            folderMap.get(f._parentId).item.push(f);
        } else {
            rootFolders.push(f);
        }
    });

    const rootRequests: any[] = [];

    requests.forEach(req => {
        const parseJson = (val: any) => {
            if (typeof val === 'string') {
                try { return JSON.parse(val); } catch (e) { return val; }
            }
            return val;
        };

        const headers = parseJson(req.headers || '[]');
        const params = parseJson(req.params || '[]');
        const body = parseJson(req.body || '{}');
        const postmanUrl = parseUrl(req.url || '', req.protocol || 'http');

        if (Array.isArray(params) && params.length > 0) {
            if (!postmanUrl.query) postmanUrl.query = [];
            params.forEach((p: any) => {
                if (!postmanUrl.query!.find((q: any) => q.key === p.key)) {
                    postmanUrl.query!.push({
                        key: p.key,
                        value: p.value || '',
                        description: p.description || '',
                        disabled: p.enabled === false
                    });
                }
            });
        }

        const postmanReq = {
            name: req.name || 'Unnamed Request',
            protocolProfileBehavior: {
                disableBodyPruning: true
            },
            request: {
                method: req.method || 'GET',
                header: (Array.isArray(headers) ? headers : []).map((h: any) => ({
                    key: h.key,
                    value: h.value,
                    description: h.description || '',
                    disabled: h.enabled === false
                })),
                body: body?.mode === 'raw' ? {
                    mode: 'raw',
                    raw: body.raw || '',
                    options: {
                        raw: {
                            language: 'json'
                        }
                    }
                } : body?.mode === 'graphql' ? {
                    mode: 'graphql',
                    graphql: {
                        query: body.graphql?.query || '',
                        variables: body.graphql?.variables || '{}'
                    }
                } : {
                    mode: 'raw',
                    raw: body?.raw || '',
                    options: {
                        raw: {
                            language: 'json'
                        }
                    }
                },
                url: postmanUrl,
                description: req.description || ''
            },
            response: []
        };

        const fId = req.folderId || req.folder_id;
        if (fId && folderMap.has(fId)) {
            folderMap.get(fId).item.push(postmanReq);
        } else {
            rootRequests.push(postmanReq);
        }
    });

    const cleanItem = (item: any) => {
        const { _id, _parentId, ...rest } = item;
        if (rest.item) {
            rest.item = rest.item.map(cleanItem);
        }
        return rest;
    };

    collection.item = [...rootFolders.map(cleanItem), ...rootRequests];
    return collection;
}
