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
import { compactionJobs } from './http/jobs/compaction.mjs';
import { mediaJobs, recoverStaged, STOPPED } from './http/jobs/media.mjs';
import { suggestionJobs } from './http/jobs/suggestions.mjs';
import { titleJobs } from './http/jobs/title.mjs';
import { stateRoutes } from './http/routes/state.mjs';
import { settingsRoutes } from './http/routes/settings.mjs';
import { knowledgeRoutes } from './http/routes/knowledge.mjs';
import { mediaRoutes } from './http/routes/media.mjs';
import { authRoutes } from './http/routes/auth.mjs';
import { treeRoutes } from './http/routes/trees.mjs';
import { assetRoutes } from './http/routes/assets.mjs';
import { tesseractOcr } from './ocr.mjs';
import { toolRunner } from './tools/runner.mjs';
import { searxngSearch } from './tools/searxng.mjs';
import { toolMcp } from './tools/mcp.mjs';

// Matching order; each route answers only its own method and paths, and assets answers everything left.
const ROUTES = [
  stateRoutes,
  settingsRoutes,
  knowledgeRoutes,
  mediaRoutes,
  authRoutes,
  treeRoutes,
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
  diagramTimeout = 300000,
  diagramParse,
  visualTimeout = 300000,
  dir = join(tmpdir(), 'treetutor'),
  videoTimeout,
  videoRender,
  videoSnapshot,
  videoNarrate,
  videoManim,
  log = stdoutLog,
  suggestions = false,
  suggestionTimeout,
  desktop = systemDesktop,
  recognize = tesseractOcr(dir),
  tools,
  python,
  searxng = () => ({ ready: false, url: null, error: 'SearXNG is not managed by this server.' }),
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
    diagramParse,
    visualTimeout,
    dir,
    videoTimeout,
    videoRender,
    videoSnapshot,
    videoNarrate,
    videoManim,
    log,
    suggestions,
    suggestionTimeout,
    desktop,
    recognize,
    tools: tools ?? toolRunner({ search, python, dir, memory: store, resources: store }),
    python,
    mcp: toolMcp(),
    search,
    stopping: false,
    csrf: randomBytes(32).toString('hex'),
    active: new Map(),
    videos: new Map(),
    videoJobs: new Set(),
    // Branch-first: child id -> background compaction { controller, done, settled, error }; kept after failure, removed on success.
    compactions: new Map(),
    // Parent id -> compaction started when the branch form opened { key, controller, run }; submit reuses it while the key matches.
    prepared: new Map(),
    suggesting: new Map(),
    titling: new Map(),
    json: (res, status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return true;
    },
    origin: () => `http://127.0.0.1:${server.address().port}`,
  };
  Object.assign(ctx, roles(ctx));
  ctx.syncEndpoints();
  Object.assign(ctx, compactionJobs(ctx), mediaJobs(ctx), suggestionJobs(ctx), titleJobs(ctx));
  const { active, videoJobs, suggesting, titling, compactions, prepared, json } = ctx;
  let stopped;
  recoverStaged(store, dir);
  const server = http.createServer(async (req, res) => {
    const started = performance.now();
    const path = new URL(req.url, ctx.origin()).pathname;
    const logging = logRequest(req.method, path);
    let cause;
    if (logging)
      res.once('finish', () =>
        log(
          formatLog(
            cause || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
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
    const url = new URL(req.url, origin);
    let body;
    try {
      if (ctx.stopping)
        return json(res, 503, { error: 'TreeTutor is stopping. Your partial replies are saved.' });
      // A question with attachments arrives as multipart form data; every other POST is JSON.
      const multipart =
        req.method === 'POST' &&
        /^\/api\/trees\/[^/]+\/messages$/.test(url.pathname) &&
        /^multipart\/form-data;/.test(req.headers['content-type'] ?? '');
      if (req.method === 'POST') {
        if (
          req.headers['x-treetutor-csrf'] !== ctx.csrf ||
          (req.headers['content-type'] !== 'application/json' && !multipart)
        )
          return json(res, 403, { error: 'Reload TreeTutor before trying again.' });
      }
      if (multipart) {
        try {
          const form = await new Request(url, {
            method: 'POST',
            headers: { 'content-type': req.headers['content-type'] },
            body: req,
            duplex: 'half',
          }).formData();
          const text = form.get('text') ?? '';
          if (typeof text === 'string' && text.length > 100000)
            return json(res, 413, { error: 'Message too long. Shorten it and try again.' });
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
            return json(res, 413, { error: 'Message too long. Shorten it and try again.' });
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
        error.code ?? errorCause(error, [...privateValues(body), ...url.searchParams.values()]);
      if (!res.headersSent)
        json(res, error.code === 'ENOENT' ? 404 : 500, {
          error: 'TreeTutor could not finish this request. Reload and try again.',
        });
      else res.end();
    }
  });
  return {
    server,
    active,
    // Await the existing background jobs without polling their persisted state.
    settled: (artifact) =>
      Promise.allSettled(
        [...videoJobs, ...suggesting.values(), ...titling.values(), ...compactions.values()]
          .filter((v) => !artifact || v.artifact === artifact)
          .map((v) => v.done),
      ),
    stop: () => {
      if (stopped) return stopped;
      ctx.stopping = true;
      for (const controller of active.values()) controller.abort();
      for (const v of videoJobs) v.controller.abort(STOPPED);
      for (const s of suggesting.values()) s.controller.abort();
      for (const t of titling.values()) t.controller.abort();
      for (const c of compactions.values()) c.controller.abort();
      for (const parent of [...prepared.keys()]) ctx.unprepare(parent);
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
        Promise.allSettled([
          closed,
          ctx.mcp.close(),
          recognize.stop?.(),
          ...[...videoJobs].map((v) => v.done),
        ]).then(() => {
          clearTimeout(timer);
          resolve();
        });
      });
      return stopped;
    },
  };
}
