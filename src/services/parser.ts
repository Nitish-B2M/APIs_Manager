interface DevManusItem {
    name: string;
    item?: DevManusItem[];
    request?: {
        method: string;
        url: { raw: string; host?: string[]; path?: string[] } | string;
        header?: { key: string; value: string; description?: string }[];
        body?: { mode: string; raw?: string; formdata?: any[] };
        description?: string;
    };
}

export interface ParsedEndpoint {
    id: string;
    type: 'ENDPOINT';
    name: string;
    method: string;
    url: string;
    description?: string;
    headers: { key: string; value: string }[];
    body?: string;
}

export interface ParsedGroup {
    id: string;
    type: 'GROUP';
    name: string;
    description?: string;
    items: (ParsedGroup | ParsedEndpoint)[];
}

export const parseCollection = (collection: any): ParsedGroup[] => {
    if (!collection.item || !Array.isArray(collection.item)) {
        return [];
    }

    return collection.item.map((item: any) => parseItem(item));
};

const parseItem = (item: DevManusItem): ParsedGroup | ParsedEndpoint => {
    if (item.item) {
        return {
            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(), // basic fallback
            type: 'GROUP',
            name: item.name,
            items: item.item.map((subItem) => parseItem(subItem)),
        } as ParsedGroup;
    }

    let url = '';
    if (typeof item.request?.url === 'string') {
        url = item.request.url;
    } else if (item.request?.url?.raw) {
        url = item.request.url.raw;
    }

    return {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
        type: 'ENDPOINT',
        name: item.name,
        method: item.request?.method || 'GET',
        url: url,
        description: item.request?.description,
        headers: item.request?.header?.map((h) => ({ key: h.key, value: h.value })) || [],
        body: item.request?.body?.raw || '',
    } as ParsedEndpoint;
};
