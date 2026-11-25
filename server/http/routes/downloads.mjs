import { cliInstaller, installable } from '../../providers/install.mjs';

// The download list streams as server-sent events; the actions are Retry and "seen". Add-ons list, install and retry by id.
export async function downloadRoutes(req, res, url, ctx) {
    const { downloads, json } = ctx;
    if (!url.pathname.startsWith('/api/downloads')) return false;
    if (!downloads) return json(res, 404, { error: 'Downloads are not managed by this server.' });
    if (req.method === 'GET' && url.pathname === '/api/downloads') {
        const includeSeen = url.searchParams.get('includeSeen') === '1';
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
        // A setup view needs completion even if the learner dismissed it from the sidebar.
        const send = (list) =>
            res.write(`data: ${JSON.stringify(includeSeen ? downloads.list(true) : list)}\n\n`);
        send(downloads.list());
        const unsubscribe = downloads.subscribe(send);
        ctx.downloadStreams.add(res);
        res.once('close', () => {
            unsubscribe();
            ctx.downloadStreams.delete(res);
        });
        return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/downloads/addons')
        return json(res, 200, downloads.addons());
    if (req.method !== 'POST') return false;
    if (url.pathname === '/api/downloads/seen') {
        downloads.seen();
        return json(res, 200, downloads.list());
    }
    // Claude Code or Codex: their installer runs at once, listed like a download.
    const cli = url.pathname.match(/^\/api\/downloads\/install\/(\w+)$/);
    if (cli) {
        if (!installable(cli[1])) return json(res, 404, { error: 'No such tool.' });
        void downloads.now(cliInstaller(cli[1]));
        return json(res, 200, downloads.list());
    }
    // Retry is an install that queues again only what failed.
    const install = url.pathname.match(/^\/api\/downloads\/addons\/([\w-]+)(?:\/retry)?$/);
    if (install) {
        if (!(await downloads.install(install[1])))
            return json(res, 404, { error: 'No such add-on.' });
        return json(res, 200, downloads.addons());
    }
    const retry = url.pathname.match(/^\/api\/downloads\/([\w-]+)\/retry$/);
    if (!retry) return false;
    if (!downloads.retry(retry[1]))
        return json(res, 409, { error: 'Only a failed download can be retried.' });
    return json(res, 200, downloads.list());
}
