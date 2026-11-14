import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
};

// The last route: unknown API paths, other methods, then the built app's static files.
export async function assetRoutes(req, res, url, { json, assets }) {
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found.' });
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  const path = resolve(
    assets,
    '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
  );
  if (!path.startsWith(assets + '/')) return json(res, 404, { error: 'Not found.' });
  const data = await readFile(path);
  res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
  res.end(data);
  return true;
}
