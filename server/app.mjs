import http from 'node:http';
import {
    stdoutLog,
    formatLog,
    errorCause,
    privateValues,
    requestPath,
    logRequest,
} from './log.mjs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { desktop as systemDesktop } from './desktop.mjs';
import { secure } from './http/security.mjs';
import { roles } from './http/roles.mjs';
import { quickCalls } from './http/quick.mjs';
import { compactionJobs } from './http/jobs/compaction.mjs';
import { discussionJobs } from './http/jobs/discussions.mjs';
import { discussionRoutes } from './http/routes/discussions.mjs';
import { mediaJobs, recoverStaged } from './http/jobs/media.mjs';
import { suggestionJobs } from './http/jobs/suggestions.mjs';
import { titleJobs } from './http/jobs/title.mjs';
import { verdictJobs } from './http/jobs/verdicts.mjs';
import { briefJobs } from './http/jobs/briefs.mjs';
import { backgroundJobs } from './http/jobs/background.mjs';
import { stateRoutes } from './http/routes/state.mjs';
import { settingsRoutes } from './http/routes/settings.mjs';
import { knowledgeRoutes } from './http/routes/knowledge.mjs';
import { mediaRoutes } from './http/routes/media.mjs';
import { authRoutes } from './http/routes/auth.mjs';
import { treeRoutes } from './http/routes/trees.mjs';
import { assetRoutes } from './http/routes/assets.mjs';
import { windowsSandbox } from './media/video-sandbox.mjs';
import { downloadRoutes } from './http/routes/downloads.mjs';
import { tesseractOcr } from './ocr.mjs';
import { toolRunner } from './tools/runner.mjs';
import { recallTools, messageEmbeddings } from './tools/recall.mjs';
import { searxngSearch } from './tools/searxng.mjs';
import { toolMcp } from './tools/mcp.mjs';
import { retrieveNeighbourhood } from './neighbourhood.mjs';
import { pieceStills } from './media/piece-stills.mjs';

// Matching order; each route answers only its own method and paths, and assets answers everything left.
const ROUTES = [
    stateRoutes,
    settingsRoutes,
    knowledgeRoutes,
    mediaRoutes,
    authRoutes,
    discussionRoutes,
    treeRoutes,
    downloadRoutes,
    assetRoutes,
];

export function createApp({
    store,
    auth,
    provider,
    providers = { codex: provider },
    endpoint,
    defaultProvider = 'codex',
    assets = resolve('dist'),
    diagramTimeout,
    // Minimum ms between mid-stream reply saves and page updates; tests pass 0 to see each delta.
    saveEvery = 250,
    diagramParse,
    visualTimeout,
    dir = join(tmpdir(), 'rabbithole'),
    videoTimeout,
    videoRender,
    videoSnapshot,
    videoNarrate,
    videoManim,
    videoEmbed = null,
    // Renders library piece stills; off unless the server passes the sandbox snapshot, like suggestions in tests.
    pieceSnapshot = null,
    log = stdoutLog,
    suggestions = false,
    // Off in tests like suggestions, so fake replies without a verdict block make no extra calls.
    verdicts = false,
    // Off in tests like verdicts, so suggestion tests count no brief batch calls.
    briefs = false,
    suggestionTimeout,
    desktop = systemDesktop,
    recognize = tesseractOcr(dir),
    tools,
    python,
    searxng = () => ({ ready: false, url: null, error: 'SearXNG is not managed by this server.' }),
    // The tool download manager (server/downloads.mjs); tests and embedded servers run without one.
    downloads = null,
    sandbox = windowsSandbox(),
}) {
    const search = searxngSearch({ store, managed: searxng });
    // One context for every extracted module; stopping is read from it at call time.
    const ctx = {
        store,
        auth,
        providers,
        endpoint,
        defaultProvider,
        assets,
        diagramTimeout,
        saveEvery,
        diagramParse,
        visualTimeout,
        dir,
        videoTimeout,
        videoRender,
        videoSnapshot,
        videoNarrate,
        videoManim,
        videoEmbed,
        neighbourhood: (text, signal) => retrieveNeighbourhood(store, videoEmbed, text, signal),
        log,
        suggestions,
        verdicts,
        briefs,
        suggestionTimeout,
        desktop,
        recognize,
        tools:
            tools ??
            toolRunner({
                search,
                python,
                dir,
                memory: store,
                resources: store,
                recall: recallTools({
                    store,
                    embed: videoEmbed,
                    // The reading conversation's quick thinking model writes the paragraph; ctx.compact is assigned below.
                    compact: async (prompt, conversation) => {
                        const { quick, error } = await ctx.quickFor(store.tree(conversation));
                        if (error) throw new Error(error);
                        return ctx.compact(prompt, quick, new AbortController());
                    },
                }),
            }),
        python,
        downloads,
        sandbox,
        downloadStreams: new Set(),
        mcp: toolMcp(),
        search,
        stopping: false,
        csrf: randomBytes(32).toString('hex'),
        // Every kind of background work: titles, verdicts, suggestions, briefs, compactions, discussions, replies, media.
        jobs: backgroundJobs(),
        json: (res, status, body) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
            return true;
        },
        origin: () => `http://127.0.0.1:${server.address().port}`,
    };
    ctx.pieceStills = pieceSnapshot
        ? pieceStills({
              store,
              dir,
              snapshot: pieceSnapshot,
              onWarning: (error) =>
                  log(
                      formatLog('warn', 'media', 'piece stills failed', {
                          task: 'pieces',
                          cause: errorCause(error, []),
                      }),
                  ),
          })
        : { fill: () => {}, stop: () => {} };
    // Called when a reply settles (the job also embeds the learner message before it) and at startup.
    ctx.embedMessages = videoEmbed
        ? messageEmbeddings({
              store,
              embed: videoEmbed,
              jobs: ctx.jobs,
              onWarning: (error) =>
                  log(
                      formatLog('warn', 'recall', 'message embedding failed', {
                          task: 'embeddings',
                          cause: errorCause(error, []),
                      }),
                  ),
          })
        : () => {};
    Object.assign(ctx, roles(ctx));
    Object.assign(ctx, quickCalls(ctx));
    ctx.syncEndpoints();
    ctx.readyQuick();
    Object.assign(
        ctx,
        compactionJobs(ctx),
        discussionJobs(ctx),
        mediaJobs(ctx),
        suggestionJobs(ctx),
        titleJobs(ctx),
        verdictJobs(ctx),
        briefJobs(ctx),
    );
    const { json } = ctx;
    let stopped;
    recoverStaged(store, dir);
    // Older messages left unembedded fill in from startup.
    ctx.embedMessages();
    const server = http.createServer(async (req, res) => {
        const started = performance.now();
        const url = URL.parse(req.url, ctx.origin());
        if (!url) return res.writeHead(400).end();
        const path = url.pathname;
        const logging = logRequest(req.method, path);
        let cause;
        if (logging)
            res.once('finish', () =>
                log(
                    formatLog(
                        cause || res.statusCode >= 500
                            ? 'error'
                            : res.statusCode >= 400
                              ? 'warn'
                              : 'info',
                        'http',
                        'request',
                        {
                            method: req.method,
                            path: requestPath(path),
                            status: res.statusCode,
                            ms: Math.round(performance.now() - started),
                            ...((cause || res.statusCode >= 400) && {
                                cause: cause ?? http.STATUS_CODES[res.statusCode],
                                next: 'Check the request or server setup, then retry.',
                            }),
                        },
                    ),
                ),
            );
        const origin = ctx.origin();
        if (secure(req, res, origin, json)) return;
        let body;
        try {
            if (ctx.stopping)
                return json(res, 503, {
                    error: 'Rabbithole is stopping. Your partial replies are saved.',
                });
            // A question with attachments arrives as multipart form data; every other POST is JSON.
            const multipart =
                req.method === 'POST' &&
                /^\/api\/trees\/[^/]+\/messages$/.test(url.pathname) &&
                /^multipart\/form-data;/.test(req.headers['content-type'] ?? '');
            if (req.method === 'POST') {
                if (
                    req.headers['x-rabbithole-csrf'] !== ctx.csrf ||
                    (req.headers['content-type'] !== 'application/json' && !multipart)
                )
                    return json(res, 403, { error: 'Reload Rabbithole before trying again.' });
            }
            if (multipart) {
                // formData() buffers the whole body, so refuse oversized or unsized uploads before reading it.
                if (!(Number(req.headers['content-length']) <= 50 * 1024 * 1024))
                    return json(res, 413, {
                        error: 'Attachments too large. Attach under 50 MB in total.',
                    });
                try {
                    const form = await new Request(url, {
                        method: 'POST',
                        headers: { 'content-type': req.headers['content-type'] },
                        body: req,
                        duplex: 'half',
                    }).formData();
                    const text = form.get('text') ?? '';
                    if (typeof text === 'string' && text.length > 100000)
                        return json(res, 413, {
                            error: 'Message too long. Shorten it and try again.',
                        });
                    body = {
                        text,
                        ...(form.has('theme') && { theme: JSON.parse(form.get('theme')) }),
                        files: form.getAll('files'),
                    };
                } catch {
                    return json(res, 400, { error: 'Invalid request.' });
                }
            } else if (req.method === 'POST') {
                const chunks = [];
                let bytes = 0;
                for await (const chunk of req) {
                    chunks.push(chunk);
                    bytes += chunk.length;
                    if (bytes > 100000)
                        return json(res, 413, {
                            error: 'Message too long. Shorten it and try again.',
                        });
                }
                try {
                    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                } catch {
                    return json(res, 400, { error: 'Invalid request.' });
                }
            }
            for (const route of ROUTES) if (await route(req, res, url, ctx, body)) return;
        } catch (error) {
            cause =
                error.code ??
                errorCause(error, [...privateValues(body), ...url.searchParams.values()]);
            if (!res.headersSent)
                json(res, error.code === 'ENOENT' ? 404 : 500, {
                    error: 'Rabbithole could not finish this request. Reload and try again.',
                });
            else res.end();
        }
    });
    return {
        server,
        jobs: ctx.jobs,
        // Await the existing background jobs without polling their persisted state.
        settled: ctx.jobs.settled,
        stop: () => {
            if (stopped) return stopped;
            ctx.stopping = true;
            const ended = ctx.jobs.stop();
            ctx.pieceStills.stop();
            downloads?.stop();
            for (const stream of ctx.downloadStreams) stream.end();
            store.interrupt();
            for (const p of new Set(Object.values(providers))) p?.close?.();
            // Let final interrupted events drain before closing sockets; bound shutdown for a stuck client or job.
            stopped = new Promise((resolve) => {
                const timer = setTimeout(() => {
                    server.closeAllConnections();
                    resolve();
                }, 5000).unref();
                const closed = new Promise((done) => server.close(done));
                server.closeIdleConnections();
                Promise.allSettled([closed, ctx.mcp.close(), recognize.stop?.(), ended]).then(
                    () => {
                        clearTimeout(timer);
                        resolve();
                    },
                );
            });
            return stopped;
        },
    };
}
