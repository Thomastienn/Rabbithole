// Sets the security headers for every request; answers 403 and returns true when the request must be refused.
export function secure(req, res, origin, json) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https: http:; connect-src 'self'; frame-src ${origin}/sandbox.html ${origin}/player.html; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  );
  // The visual sandbox has an opaque origin, so its bundled scripts and fonts arrive as cross-site CORS loads; only static GETs are opened to it.
  const sandboxAsset =
    req.method === 'GET' &&
    req.headers.host === new URL(origin).host &&
    /^\/assets\/[\w.-]+$/.test(req.url) &&
    req.headers.origin === 'null';
  if (sandboxAsset) res.setHeader('Access-Control-Allow-Origin', 'null');
  // Visual and live video code: inline only, bundled libraries from this origin, no network, frames, forms or remote media.
  // The live player gets narration and clips from the app as blobs, never by URL.
  if (req.method === 'GET' && (req.url === '/sandbox.html' || req.url === '/player.html'))
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src ${origin} 'unsafe-inline'; style-src ${origin} 'unsafe-inline'; font-src ${origin} data:; img-src data: blob:;${req.url === '/player.html' ? ' media-src blob:;' : ''} connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors ${origin}`,
    );
  if (
    !sandboxAsset &&
    (req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers['sec-fetch-site'] === 'cross-site')
  ) {
    // OAuth is the only permitted cross-site navigation; validated by one-time state.
    if (!(
      req.method === 'GET' &&
      req.url.startsWith('/auth/callback?') &&
      req.headers.host === new URL(origin).host
    )) {
      json(res, 403, { error: 'Open Rabbithole using its loopback address.' });
      return true;
    }
  }
  return false;
}
