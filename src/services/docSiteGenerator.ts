/**
 * API Documentation Site Generator — generates static HTML documentation from collections.
 */

interface DocEndpoint {
    name: string;
    method: string;
    url: string;
    description?: string;
    headers?: any[];
    body?: any;
    params?: any[];
}

/**
 * Generate a complete HTML documentation page from a collection.
 */
export function generateDocSite(
    title: string,
    description: string,
    endpoints: DocEndpoint[],
    theme: 'light' | 'dark' = 'dark',
    version?: string
): string {
    const isDark = theme === 'dark';
    const bg = isDark ? '#0d1117' : '#ffffff';
    const text = isDark ? '#c9d1d9' : '#24292e';
    const cardBg = isDark ? '#161b22' : '#f6f8fa';
    const border = isDark ? '#30363d' : '#d0d7de';
    const accent = '#6366f1';

    const methodColors: Record<string, string> = {
        GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b', DELETE: '#ef4444', PATCH: '#a855f7',
    };

    const endpointHtml = endpoints.map((ep, i) => `
        <div id="endpoint-${i}" style="background:${cardBg};border:1px solid ${border};border-radius:12px;padding:24px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <span style="background:${methodColors[ep.method] || accent};color:white;padding:4px 12px;border-radius:6px;font-weight:700;font-size:12px;text-transform:uppercase;">${ep.method}</span>
                <code style="font-size:14px;color:${text};word-break:break-all;">${ep.url}</code>
            </div>
            <h3 style="margin:0 0 8px 0;color:${text};font-size:18px;">${ep.name}</h3>
            ${ep.description ? `<p style="color:${isDark ? '#8b949e' : '#57606a'};font-size:14px;margin:0 0 16px 0;">${ep.description}</p>` : ''}
            ${ep.headers?.length ? `
                <div style="margin-top:12px;">
                    <h4 style="color:${accent};font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0;">Headers</h4>
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        ${ep.headers.map((h: any) => `<tr><td style="padding:4px 8px;border-bottom:1px solid ${border};font-weight:600;">${h.key}</td><td style="padding:4px 8px;border-bottom:1px solid ${border};color:${isDark ? '#8b949e' : '#57606a'};">${h.value}</td></tr>`).join('')}
                    </table>
                </div>
            ` : ''}
            ${ep.body ? `
                <div style="margin-top:12px;">
                    <h4 style="color:${accent};font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0;">Body</h4>
                    <pre style="background:${isDark ? '#0d1117' : '#f0f0f0'};padding:12px;border-radius:8px;overflow-x:auto;font-size:12px;color:${text};">${typeof ep.body === 'string' ? ep.body : JSON.stringify(ep.body, null, 2)}</pre>
                </div>
            ` : ''}
        </div>
    `).join('');

    const sidebar = endpoints.map((ep, i) => `
        <a href="#endpoint-${i}" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;text-decoration:none;color:${text};font-size:13px;transition:background 0.2s;">
            <span style="background:${methodColors[ep.method] || accent};color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">${ep.method}</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ep.name}</span>
        </a>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — API Documentation</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${bg}; color: ${text}; }
        a:hover { background: ${isDark ? '#21262d' : '#f0f0f0'} !important; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: ${border}; border-radius: 3px; }
    </style>
</head>
<body>
    <div style="display:flex;min-height:100vh;">
        <nav style="width:280px;flex-shrink:0;border-right:1px solid ${border};padding:24px 12px;overflow-y:auto;position:sticky;top:0;height:100vh;">
            <h1 style="font-size:20px;font-weight:800;margin-bottom:4px;color:${accent};">${title}</h1>
            ${version ? `<span style="font-size:11px;color:${isDark ? '#8b949e' : '#57606a'};">v${version}</span>` : ''}
            <p style="font-size:12px;color:${isDark ? '#8b949e' : '#57606a'};margin:8px 0 24px 0;">${endpoints.length} endpoints</p>
            ${sidebar}
        </nav>
        <main style="flex:1;padding:32px;max-width:900px;">
            <div style="margin-bottom:32px;">
                <h1 style="font-size:32px;font-weight:800;">${title}</h1>
                ${description ? `<p style="font-size:16px;color:${isDark ? '#8b949e' : '#57606a'};margin-top:8px;">${description}</p>` : ''}
                ${version ? `<span style="display:inline-block;margin-top:12px;background:${accent};color:white;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">v${version}</span>` : ''}
            </div>
            ${endpointHtml}
            <footer style="margin-top:48px;padding-top:24px;border-top:1px solid ${border};text-align:center;color:${isDark ? '#484f58' : '#8b949e'};font-size:12px;">
                Generated by DevManus Documentation Platform
            </footer>
        </main>
    </div>
</body>
</html>`;
}
