import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
};

// The file a URL path names inside the assets folder, or null when it is malformed or escapes it.
// Defaults to the host path rules; tests pass path.win32 to check Windows on any machine.
export function assetPath(assets, pathname, { resolve, sep } = path) {
    let name;
    try {
        name = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    } catch {
        return null;
    }
    const file = resolve(assets, '.' + name);
    return file.startsWith(assets + sep) ? file : null;
}

// The last route: unknown API paths, other methods, then the built app's static files.
export async function assetRoutes(req, res, url, { json, assets }) {
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found.' });
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
    const file = assetPath(assets, url.pathname);
    if (!file) return json(res, 404, { error: 'Not found.' });
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
    return true;
}
