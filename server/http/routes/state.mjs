import { LABELS, isEndpoint } from '../roles.mjs';
import pkg from '../../../package.json' with { type: 'json' };

// The desktop shell passes its own version, which CI stamps; a browser-run server has the repo's.
const version = process.env.RABBITHOLE_VERSION || pkg.version;

// App state, usage history, search, conversation previews and the model list.
export async function stateRoutes(req, res, url, ctx) {
    const { store, json, providers } = ctx;
    if (req.method !== 'GET') return false;
    if (url.pathname === '/api/state')
        return json(res, 200, {
            csrf: ctx.csrf,
            version,
            auth: ctx.auth.status(),
            firstRun: !store.setupFinished(),
            trees: store.list(),
            active: ctx.jobs.list('reply').map((r) => r.key),
            discussing: [...new Set(ctx.jobs.list('discussion').map((j) => j.conversation))],
            usage: store.usageSince(new Date().setHours(0, 0, 0, 0)),
            videos: [
                ...new Set(
                    [
                        ...ctx.jobs.list('video'),
                        ...ctx.jobs.list('drawing'),
                        // Waiting cards poll while their tools download, so they render without asking again.
                        ...(ctx.downloads?.addons()[0].state === 'downloading'
                            ? store.waitingVideos()
                            : []),
                    ].map((v) => v.conversation),
                ),
            ],
            suggesting: [...new Set(ctx.jobs.list('suggestion').map((s) => s.conversation))],
            titling: ctx.jobs.list('title').map((t) => t.conversation),
            // A failed compaction stays for retry; only running ones are compacting.
            compacting: ctx.jobs
                .list('compaction')
                .filter((c) => !c.error)
                .map((c) => c.key),
        });
    if (url.pathname === '/api/usage')
        return json(
            res,
            200,
            store.usageEvents(
                ...['from', 'to'].map((k) =>
                    url.searchParams.has(k) ? Number(url.searchParams.get(k)) || 0 : undefined,
                ),
            ),
        );
    if (url.pathname === '/api/search')
        return json(res, 200, store.search((url.searchParams.get('q') ?? '').slice(0, 200)));
    if (url.pathname === '/api/previews') {
        const ids = [...new Set(url.searchParams.getAll('id'))];
        if (ids.length > 500) return json(res, 400, { error: 'Too many conversations requested.' });
        return json(
            res,
            200,
            Object.fromEntries(
                Object.entries(store.previews(ids)).map(([id, rows]) => [
                    id,
                    rows.map((m) =>
                        m.artifacts ? { ...m, artifacts: m.artifacts.map(ctx.live) } : m,
                    ),
                ]),
            ),
        );
    }
    if (url.pathname === '/api/models') {
        const ids = Object.keys(providers);
        const results = await Promise.allSettled(ids.map((id) => providers[id].models()));
        // Every known provider is named, connected or not, so clients never keep their own label list.
        const named = Object.fromEntries(
            Object.keys({ ...LABELS, ...providers }).map((id) => [
                id,
                {
                    label: providers[id]?.label ?? LABELS[id] ?? id,
                    connected: results[ids.indexOf(id)]?.status === 'fulfilled',
                    // Only CLI providers answer; false means setup shows the install page.
                    ...(providers[id]?.installed && { installed: providers[id].installed() }),
                },
            ]),
        );
        if (results.every((r) => r.status === 'rejected'))
            return json(res, 502, {
                error: Object.keys(providers).some(isEndpoint)
                    ? 'Could not load models. Check provider sign-in or custom endpoint settings, then retry.'
                    : 'Could not load models. Sign in to Claude or ChatGPT, then retry.',
                providers: named,
            });
        return json(res, 200, {
            models: results.flatMap((r, i) =>
                r.status === 'fulfilled'
                    ? ctx.withTyped(ids[i], r.value).map((m) => ({ provider: ids[i], ...m }))
                    : [],
            ),
            providers: named,
            defaultProvider: ctx.defaultProvider,
        });
    }
    return false;
}
