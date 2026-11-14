import { stat, lstat, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { mediaPath, playable } from '../../media/videos.mjs';
import { readable } from '../jobs/media.mjs';

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
            live: conversation,
          })),
        ...store
          .library()
          .map((v) => (readable(mediaPath(dir, v.id)) ? v : { ...v, available: false })),
      ]);
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
      });
      createReadStream(mediaPath(dir, artifact.id), { start, end })
        .on('error', () => res.destroy())
        .pipe(res);
      return true;
    }
    // Live playback: only a pending cut-format video, only playable cuts, files located from server ids.
    const cutsMatch = url.pathname.match(
      /^\/api\/trees\/([^/]+)\/artifacts\/([^/]+)\/cuts(?:\/(\d+)\/(narration|clip))?$/,
    );
    if (cutsMatch) {
      const [, conversation, id, index, file] = cutsMatch,
        artifact = store.artifact(conversation, id);
      let data = null;
      try {
        if (artifact?.kind === 'video' && artifact.status === 'pending')
          data = JSON.parse(artifact.source);
      } catch {}
      if (!Array.isArray(data?.cuts)) return json(res, 404, { error: 'Live video not available.' });
      if (!file)
        return json(res, 200, {
          paletteRoles: data.plan.styleBrief.paletteRoles,
          cuts: data.cuts.map((cut) => ({
            engine: cut.engine,
            timing: cut.timing,
            code: playable(cut) && cut.engine !== 'manim' ? compileCut(cut.code) : null,
            playable: playable(cut),
          })),
        });
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
        error: 'This video’s saved file is not a regular file, so TreeTutor will not touch it.',
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
  ctx.startVideo(job);
  return json(res, 200, live(job));
}
