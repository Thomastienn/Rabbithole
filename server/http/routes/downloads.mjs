// The download list streams as server-sent events; Retry and "seen" are the only actions.
export async function downloadRoutes(req, res, url, ctx) {
  const { downloads, json } = ctx;
  if (!url.pathname.startsWith('/api/downloads')) return false;
  if (!downloads) return json(res, 404, { error: 'Downloads are not managed by this server.' });
  if (req.method === 'GET' && url.pathname === '/api/downloads') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
    const send = (list) => res.write(`data: ${JSON.stringify(list)}\n\n`);
    send(downloads.list());
    const unsubscribe = downloads.subscribe(send);
    ctx.downloadStreams.add(res);
    res.once('close', () => {
      unsubscribe();
      ctx.downloadStreams.delete(res);
    });
    return true;
  }
  if (req.method !== 'POST') return false;
  if (url.pathname === '/api/downloads/seen') {
    downloads.seen();
    return json(res, 200, downloads.list());
  }
  const retry = url.pathname.match(/^\/api\/downloads\/([\w-]+)\/retry$/);
  if (!retry) return false;
  if (!downloads.retry(retry[1]))
    return json(res, 409, { error: 'Only a failed download can be retried.' });
  return json(res, 200, downloads.list());
}
