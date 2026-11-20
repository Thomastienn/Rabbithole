import { stat, lstat, readFile, rm } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { mediaPath, playable } from '../../media/videos.mjs';
import { withParts } from '../../media/video-pieces.mjs';
import { readable, savedCuts } from '../jobs/media.mjs';
import { formatLog, errorCause } from '../../log.mjs';

// Validated cut TSX becomes a CommonJS function body; the player sandbox supplies require() for the kit and libraries.
const compileCut = (code) =>
  ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

const exportState = (ctx, id) => {
  const job = ctx.exports.get(id);
  if (job?.error) return { exported: false, error: job.error };
  if (job) return { exported: false, exporting: true, progress: job.progress };
  return { exported: readable(mediaPath(ctx.dir, id)) };
};

// The video library, media playback, artifact reads and artifact job actions.
export async function mediaRoutes(req, res, url, ctx, body) {
  const { store, json, dir, live, videos } = ctx;
  if (req.method === 'GET') {
    // The library owns ready videos, independent of any conversation; playback never calls a provider.
    // A playable video joins the library live until its MP4 is saved; `live` names its conversation for the cut routes.
    if (url.pathname === '/api/videos')
      return json(res, 200, [
        ...[...videos.values()]
          .filter((job) => ['playable', 'saving'].includes(job.phase))
          .map((job) => store.artifact(job.conversation, job.artifact))
          .filter((a) => a?.kind === 'video' && a.status === 'pending')
          .map(({ id, title, description, created, conversation }) => ({
            id,
            title,
            description,
            duration: null,
            created,
            origin: store.tree(conversation)?.title ?? null,
            live: conversation,
          })),
        // A video is exported once its MP4 exists; an unexported one plays live from its own saved cuts.
        ...store
          .library()
          .map((v) =>
            readable(mediaPath(dir, v.id))
              ? { ...v, exported: true }
              : savedCuts(store.libraryCuts(v.id).source) &&
                  existsSync(join(dir, 'video-work', v.id))
                ? { ...v, exported: false }
                : { ...v, exported: false, available: false },
          ),
      ]);
    // The read-only piece library; the source compiles for the player frame like live cut code.
    // Paged and searchable; the query is embedded with any pieces saved while no embedder was usable.
    if (url.pathname === '/api/pieces') {
      const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200),
        number = (name, fallback, max) =>
          Math.min(max, Math.max(0, Math.floor(Number(url.searchParams.get(name)) || fallback))),
        offset = number('offset', 0, Number.MAX_SAFE_INTEGER),
        limit = Math.max(1, number('limit', 24, 100));
      let vector = null;
      if (query && ctx.videoEmbed)
        try {
          const pending = store.unembeddedPieces();
          const [q, ...out] = await ctx.videoEmbed([query, ...pending.map((p) => p.look)]);
          for (const [i, p] of pending.entries()) if (out[i]) store.embedPiece(p.id, out[i]);
          vector = q ?? null;
        } catch (error) {
          ctx.log(
            formatLog('warn', 'media', 'piece search fell back to text', {
              task: 'pieces',
              cause: errorCause(error, [query]),
            }),
          );
        }
      // Backfills stills of pieces saved before stills existed, or whose render was interrupted.
      ctx.pieceStills.fill();
      return json(res, 200, store.pieceList({ query, vector, offset, limit }));
    }
    // Card stills are JPEG bytes from the store; the client adds the improvement time, so a URL never goes stale.
    const stillMatch = url.pathname.match(/^\/api\/pieces\/([^/]+)\/still(3d)?$/);
    if (stillMatch) {
      const still = store.pieceStill(stillMatch[1], stillMatch[2] ? '3d' : '2d');
      if (!still) return json(res, 404, { error: 'Still not available.' });
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=31536000, immutable',
      });
      res.end(still);
      return true;
    }
    const pieceMatch = url.pathname.match(/^\/api\/pieces\/([^/]+)$/);
    if (pieceMatch) {
      const piece = store.pieceTree(pieceMatch[1]);
      if (!piece) return json(res, 404, { error: 'Piece not found.' });
      const { id, name, look, props, source, source3d, improved } = piece;
      // The code shown is the piece's own; the player runs it with its parts' current versions.
      const whole = withParts(piece);
      return json(res, 200, {
        id,
        name,
        look,
        props,
        roles: whole.roles,
        source,
        source3d,
        improved,
        code: compileCut(whole.source),
        code3d: whole.source3d ? compileCut(whole.source3d) : null,
      });
    }
    // Export state of one saved video, polled by its Export MP4 button.
    const exportMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/export$/);
    if (exportMatch) return json(res, 200, exportState(ctx, exportMatch[1]));
    const usageMatch = url.pathname.match(/^\/api\/trees\/([^/]+)\/artifacts\/([^/]+)\/usage$/);
    if (usageMatch) return json(res, 200, store.videoUsage(usageMatch[1], usageMatch[2]));
    // Media is located only from the server-issued artifact id, never from a generated path or URL.
    const mediaMatch = url.pathname.match(/^\/api\/trees\/([^/]+)\/artifacts\/([^/]+)\/media$/),
      libraryMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/media$/);
    if (mediaMatch || libraryMatch) {
      const artifact = mediaMatch
        ? store.artifact(mediaMatch[1], mediaMatch[2])
        : store.libraryVideo(libraryMatch[1]) && {
            kind: 'video',
            status: 'ready',
            id: libraryMatch[1],
            title: store.libraryVideo(libraryMatch[1]).title,
          };
      const info =
        (artifact?.kind === 'video' &&
          artifact.status === 'ready' &&
          (await stat(mediaPath(dir, artifact.id)).catch(() => null))) ||
        null;
      if (!info?.isFile()) return json(res, 404, { error: 'Video not available.' });
      // Single byte ranges let the native player seek; anything else gets the whole file.
      const [, from, to] = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '') ?? [];
      const start = from ? Number(from) : to ? Math.max(0, info.size - Number(to)) : 0,
        end = from && to ? Math.min(Number(to), info.size - 1) : info.size - 1;
      if (req.headers.range && (from === undefined || start > end)) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
        res.end();
        return true;
      }
      res.writeHead(req.headers.range ? 206 : 200, {
        'Content-Type': 'video/mp4',
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        ...(req.headers.range && { 'Content-Range': `bytes ${start}-${end}/${info.size}` }),
        // An export delivers the MP4 as a file download (the desktop shell shows a save dialog).
        ...(url.searchParams.has('download') && {
          'Content-Disposition': `attachment; filename="video.mp4"; filename*=UTF-8''${encodeURIComponent(`${artifact.title || 'video'}.mp4`)}`,
        }),
      });
      createReadStream(mediaPath(dir, artifact.id), { start, end })
        .on('error', () => res.destroy())
        .pipe(res);
      return true;
    }
    // Live playback: only a pending or saved cut-format video, only playable cuts, files located from server ids.
    // A library video plays by its id alone, since its learning tree may be gone.
    const cutsMatch =
      url.pathname.match(
        /^\/api\/trees\/([^/]+)\/artifacts\/([^/]+)\/cuts(?:\/(\d+)\/(narration|clip|exhibit))?$/,
      ) ??
      url.pathname.match(/^\/api\/videos()\/([^/]+)\/cuts(?:\/(\d+)\/(narration|clip|exhibit))?$/);
    if (cutsMatch) {
      const [, conversation, id, index, file] = cutsMatch,
        saved = !conversation && store.libraryCuts(id),
        artifact = conversation
          ? store.artifact(conversation, id)
          : saved && { kind: 'video', status: 'ready', id, ...saved };
      let data = null;
      try {
        if (artifact?.kind === 'video' && ['pending', 'ready'].includes(artifact.status))
          data = JSON.parse(artifact.source);
      } catch {}
      if (!Array.isArray(data?.cuts)) return json(res, 404, { error: 'Live video not available.' });
      if (!file)
        return json(res, 200, {
          paletteRoles: data.plan.styleBrief.paletteRoles,
          // Roles naming a real object's true colour resolve through these hexes.
          trueColors: data.plan.styleBrief.trueColors ?? {},
          pieces: data.pieces ? compileCut(data.pieces) : null,
          // Exhibit metadata only; image and clip bytes come from /cuts/<exhibit index>/exhibit.
          exhibits: (data.exhibits ?? []).map(({ file, type, url, show, ...e }) => ({
            ...e,
            media: !!file,
          })),
          cuts: data.cuts.map((cut, i) => ({
            engine: cut.engine,
            emphasis: cut.emphasis ?? data.plan.cuts[i].emphasis ?? [],
            timing: cut.timing,
            code: playable(cut) && cut.engine !== 'manim' ? compileCut(cut.code) : null,
            playable: playable(cut),
          })),
        });
      if (file === 'exhibit') {
        const exhibit = data.exhibits?.[Number(index)];
        const bytes =
          exhibit?.file &&
          (await readFile(
            join(
              dir,
              'video-work',
              artifact.id,
              artifact.attempt,
              `cut-${exhibit.cut}`,
              exhibit.file,
            ),
          ).catch(() => null));
        if (!bytes) return json(res, 404, { error: 'Exhibit not available.' });
        res.writeHead(200, { 'Content-Type': exhibit.type });
        res.end(bytes);
        return true;
      }
      const cut = data.cuts[Number(index)];
      if (!cut || !playable(cut) || (file === 'clip' && cut.engine !== 'manim'))
        return json(res, 404, { error: 'Cut not available.' });
      const path = join(
        dir,
        'video-work',
        artifact.id,
        artifact.attempt,
        `cut-${Number(index)}`,
        'public',
        file === 'clip' ? 'manim.mp4' : 'narration.mp3',
      );
      const bytes = await readFile(path).catch(() => null);
      if (!bytes) return json(res, 404, { error: 'Cut not available.' });
      res.writeHead(200, { 'Content-Type': file === 'clip' ? 'video/mp4' : 'audio/mpeg' });
      res.end(bytes);
      return true;
    }
    const artifactMatch = url.pathname.match(/^\/api\/trees\/([^/]+)\/artifacts\/([^/]+)$/);
    if (artifactMatch) {
      const artifact = store.artifact(artifactMatch[1], artifactMatch[2]);
      return json(
        res,
        artifact ? 200 : 404,
        artifact ? live(artifact) : { error: 'Artifact not found in this conversation.' },
      );
    }
    return false;
  }
  if (req.method !== 'POST') return false;
  // Starts or joins the video's one export; an exported video answers at once with no render.
  const exportStart = url.pathname.match(/^\/api\/videos\/([^/]+)\/export$/);
  if (exportStart) {
    const [, id] = exportStart;
    if (!store.libraryVideo(id))
      return json(res, 404, { error: 'Video not found in the library.' });
    if (!readable(mediaPath(dir, id))) {
      if (!savedCuts(store.libraryCuts(id).source) || !existsSync(join(dir, 'video-work', id)))
        return json(res, 409, {
          error: 'This video’s saved work is missing, so it cannot be exported.',
        });
      ctx.startExport(id);
    }
    return json(res, 200, exportState(ctx, id));
  }
  // Desktop actions locate files only from a server-issued library id; the body carries no path or command.
  const libraryAction = url.pathname.match(/^\/api\/videos\/([^/]+)\/(reveal|trash)$/);
  if (libraryAction) {
    const [, id, action] = libraryAction;
    if (!store.libraryVideo(id))
      return json(res, 404, { error: 'Video not found in the library.' });
    const path = mediaPath(dir, id),
      info = await lstat(path).catch(() => null);
    // Only a regular file in the library folder is owned media; symlinks and directories are refused.
    if (info && !info.isFile())
      return json(res, 409, {
        error: 'This video’s saved file is not a regular file, so Rabbithole will not touch it.',
      });
    if (action === 'reveal') {
      if (!info)
        return json(res, 404, {
          error: 'This video’s saved file is missing, so there is nothing to show.',
        });
      try {
        await ctx.desktop.reveal(path);
      } catch {
        return json(res, 502, {
          error: 'Could not open the file manager. The video is still saved.',
        });
      }
      return json(res, 200, { revealed: true });
    }
    // Trash first: the entry is removed only after the file is in the system trash, or was already gone.
    if (info)
      try {
        await ctx.desktop.trash(path);
      } catch {
        return json(res, 502, {
          error:
            'Could not move the video to the system trash. Nothing was deleted and it stays in your library.',
        });
      }
    store.removeLibraryVideo(id);
    ctx.exports.get(id)?.controller.abort(new Error('Video moved to trash.'));
    // Production work is private app data, so it is deleted rather than trashed.
    await rm(join(dir, 'video-work', id), { recursive: true, force: true });
    return json(res, 200, { trashed: !!info, missing: !info });
  }
  const jobMatch = url.pathname.match(
    /^\/api\/trees\/([^/]+)\/artifacts\/([^/]+)\/(cancel|retry|regenerate)$/,
  );
  if (!jobMatch) return false;
  const [, id, artifactId, action] = jobMatch,
    tree = store.tree(id),
    artifact = store.artifact(id, artifactId);
  if (action === 'regenerate') {
    if (!tree || !['visual', 'video'].includes(artifact?.kind))
      return json(res, 404, { error: 'Visual or video not found in this conversation.' });
    // A published video's remaining work is cleanup; its new version gets a different id.
    if (videos.has(artifactId) && !(artifact.kind === 'video' && artifact.status === 'ready'))
      return json(res, 409, {
        error: 'Wait for the current generation to finish, then try a different version.',
      });
    const job = store.regenerateArtifact(id, artifactId);
    if (!job)
      return json(res, 409, {
        error: !artifact.input
          ? 'This was saved without its request. Ask the tutor for it again.'
          : 'Only a ready visual or video can have a different version.',
      });
    if (job.kind === 'video') ctx.startVideo(job);
    else
      ctx.startDrawing(
        job,
        tree.messages.find((m) => m.id === job.message)?.status === 'streaming'
          ? ctx.active.get(id)?.signal
          : undefined,
      );
    return json(res, 200, live(job));
  }
  if (tree && ['mermaid', 'visual'].includes(artifact?.kind) && action === 'retry') {
    // Retry reruns the worker from the stored request; diagrams saved before stored requests cannot.
    const label = artifact.kind === 'visual' ? 'visual' : 'diagram';
    const job =
      artifact.status === 'failed' &&
      !ctx.active.has(id) &&
      !videos.has(artifactId) &&
      store.retryArtifact(id, artifactId);
    if (!job)
      return json(res, 409, {
        error:
          artifact.status === 'failed' && !artifact.input
            ? `This ${label} was saved without its request. Ask the tutor for it again.`
            : `This ${label} does not need to be regenerated.`,
      });
    ctx.startDrawing(job);
    return json(res, 200, live(job));
  }
  if (!tree || artifact?.kind !== 'video')
    return json(res, 404, { error: 'Video not found in this conversation.' });
  if (action === 'cancel') {
    if (artifact.status !== 'pending')
      return json(res, 409, { error: 'This video is no longer generating.' });
    const canceled = store.cancelVideo(id, artifactId);
    videos.get(artifactId)?.controller.abort(new Error('Video generation canceled.'));
    return json(res, 200, live(canceled));
  }
  // Retry reuses the saved request and frozen input; no learner message is added.
  if (
    artifact.status === 'pending' ||
    (artifact.status === 'ready' && live(artifact).available !== false)
  )
    return json(res, 409, { error: 'This video does not need to be regenerated.' });
  const job = store.retryVideo(id, artifactId);
  if (!job) return json(res, 409, { error: 'This video does not need to be regenerated.' });
  // A failed attempt has settled its workspace, so its plan and good cuts can be copied.
  ctx.startVideo(job, undefined, artifact.status === 'failed' ? artifact : undefined);
  return json(res, 200, live(job));
}
