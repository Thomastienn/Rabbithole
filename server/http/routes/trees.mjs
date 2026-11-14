import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mediaPath } from '../../media/videos.mjs';
import { LABELS, isEndpoint } from '../roles.mjs';
import { anchorOf, compactionPrompt } from '../jobs/compaction.mjs';
import { sendRoute } from './send.mjs';

// Learning trees: create, read, rename, delete, layout, model changes and branching; send and retry live in send.mjs.
export async function treeRoutes(req, res, url, ctx, body) {
  const { store, json, providers, active, compactions, prepared, pick, selectionError } = ctx;
  if (req.method === 'GET') {
    const treeMatch = url.pathname.match(/^\/api\/trees\/([^/]+)$/);
    if (!treeMatch) return false;
    const tree = store.tree(treeMatch[1]);
    // A child still waiting for inherited context reports why: running, failed (with reason) or lost on restart.
    const compaction = tree?.branch && !tree.branch.snapshot && compactions.get(tree.id);
    const preparing = tree?.branch &&
      !tree.branch.snapshot && {
        compaction: !compaction
          ? {
              status: 'failed',
              error: 'This focused chat’s context was not prepared. Retry to prepare it again.',
            }
          : compaction.error
            ? { status: 'failed', error: compaction.error }
            : { status: 'compacting' },
      };
    return json(
      res,
      tree ? 200 : 404,
      tree
        ? { ...tree, artifacts: tree.artifacts.map(ctx.live), ...preparing }
        : { error: 'Learning tree not found.' },
    );
  }
  if (req.method !== 'POST') return false;
  if (url.pathname === '/api/trees') {
    // New chat saves nothing; the client creates the tree on the first send with the chosen model.
    const explicit = ['provider', 'model', 'effort'].some((key) => Object.hasOwn(body ?? {}, key));
    const selection = explicit
      ? { provider: body.provider, model: body.model, effort: body.effort ?? null }
      : ctx.chatDefault();
    if (!Object.hasOwn(providers, selection.provider))
      return json(res, 400, {
        error:
          'Chat default provider is unavailable. Configure it in Connections or change the chat default in Models.',
      });
    if (explicit || selection.model) {
      const invalid = await selectionError(selection);
      if (invalid)
        return json(res, invalid.status, {
          error: `${invalid.error} Check the chat default in Settings → Models.`,
        });
    }
    try {
      selection.model ??=
        (await providers[selection.provider].model?.({ model: null, thread: null })) ?? null;
    } catch {
      return json(res, 502, {
        error: 'Could not choose a default model. Check provider sign-in and retry.',
      });
    }
    return json(
      res,
      201,
      store.create(undefined, selection.provider, selection.model, selection.effort),
    );
  }
  const match = url.pathname.match(
    /^\/api\/trees\/([^/]+)\/(messages|retry|stop|branches|prepare|unprepare|position|layout|model|rename|delete)$/,
  );
  if (!match) return false;
  const [, id, action] = match;
  const tree = store.tree(id);
  if (!tree) return json(res, 404, { error: 'Learning tree not found.' });
  if (action === 'rename') {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200)
      return json(res, 400, { error: 'Enter a title between 1 and 200 characters.' });
    store.rename(id, body.title.trim());
    return json(res, 200, { title: body.title.trim() });
  }
  if (action === 'delete') {
    if (
      tree.branch ||
      typeof body.conversation !== 'string' ||
      !store.descendants(id).includes(body.conversation)
    )
      return json(res, 404, { error: 'Conversation not found in this chat.' });
    if (
      (body.count !== undefined && body.count !== store.descendants(body.conversation).length) ||
      (body.title !== undefined && body.title !== store.tree(body.conversation).title)
    )
      return json(res, 409, {
        error:
          'This chat changed since confirmation. Cancel and try again to review the current conversations.',
      });
    const { dir, videoJobs } = ctx;
    const staged = [],
      files = [];
    let result;
    try {
      result = store.remove(id, body.conversation, (artifacts) => {
        // Move files reversibly before commit; an SQL or filesystem failure restores their original names.
        for (const a of artifacts.filter((a) => a.kind === 'video')) {
          // Library videos keep their media; private production work is still removed.
          for (const path of [
            ...(store.libraryVideo(a.id) ? [] : [mediaPath(dir, a.id)]),
            join(dir, 'video-work', a.id),
            ...(a.attempt ? [join(dir, 'video-work', a.attempt)] : []),
          ]) {
            files.push(path);
            // Live jobs can have filesystem operations in flight; stop and remove those after commit.
            if ([...videoJobs].some((job) => job.artifact === a.id) || !existsSync(path)) continue;
            const moved = path + '.deleting-' + a.id;
            renameSync(path, moved);
            staged.push([path, moved]);
          }
        }
      });
    } catch (error) {
      for (const [path, moved] of staged.reverse()) renameSync(moved, path);
      throw error;
    }
    for (const conversation of result.deleted) {
      active.get(conversation)?.abort();
      active.delete(conversation);
      compactions.get(conversation)?.controller.abort();
      compactions.delete(conversation);
      ctx.unprepare(conversation);
    }
    const jobs = [...videoJobs].filter((v) => result.deleted.includes(v.conversation));
    for (const job of jobs) job.controller.abort(new Error('Conversation deleted.'));
    await Promise.all(jobs.map((job) => job.done));
    // A job may have been finishing a filesystem operation while its directory was moved.
    for (const path of files) rmSync(path, { recursive: true, force: true });
    for (const [, moved] of staged) rmSync(moved, { recursive: true, force: true });
    return json(res, 200, result);
  }
  if (action === 'position') {
    if (
      !Number.isFinite(body.x) ||
      !Number.isFinite(body.y) ||
      Math.abs(body.x) > 1000000 ||
      Math.abs(body.y) > 1000000
    )
      return json(res, 400, { error: 'Choose a position within the canvas.' });
    store.position(id, body.x, body.y);
    return json(res, 200, {});
  }
  if (action === 'layout') {
    const { folded, selected, panel, viewport, positions = {} } = body;
    const coordinate = (n) => Number.isFinite(n) && Math.abs(n) <= 1000000;
    const owned = new Set(); // positions may only move conversations inside this root's tree
    for (let grew = true, trees = store.list(); grew;) {
      grew = false;
      for (const t of trees)
        if (!owned.has(t.id) && (t.id === id || owned.has(t.parent))) {
          owned.add(t.id);
          grew = true;
        }
    }
    if (
      tree.branch ||
      !Array.isArray(folded) ||
      folded.length > 10000 ||
      !folded.every((f) => typeof f === 'string' && f.length <= 100 && owned.has(f)) ||
      !(
        selected === null ||
        (typeof selected === 'string' && selected.length <= 100 && owned.has(selected))
      ) ||
      !['collapsed', 'beside', 'expanded'].includes(panel) ||
      !(
        viewport === undefined ||
        (viewport &&
          coordinate(viewport.x) &&
          coordinate(viewport.y) &&
          viewport.zoom >= 0.001 &&
          viewport.zoom <= 1.5)
      ) ||
      !positions ||
      typeof positions !== 'object' ||
      Array.isArray(positions) ||
      !Object.entries(positions).every(
        ([p, at]) => owned.has(p) && at && coordinate(at.x) && coordinate(at.y),
      )
    )
      return json(res, 400, { error: 'Layout not saved. Reload and try again.' });
    store.layout(
      id,
      {
        folded,
        selected,
        panel,
        ...(viewport && {
          viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
        }),
      },
      positions,
    );
    return json(res, 200, {});
  }
  // Opening the branch form compacts in the background (it never sees the question); closing cancels.
  // Only the passage being closed is cancelled, so a close racing the next form's prepare never cancels that one.
  if (action === 'unprepare') {
    if (prepared.get(id)?.passage === anchorOf(tree, body)?.text) ctx.unprepare(id);
    return json(res, 200, {});
  }
  if (action === 'prepare') {
    const anchor = anchorOf(tree, body);
    if (!anchor || anchor.error)
      return json(res, 400, anchor ?? { error: 'Select a completed tutor passage.' });
    const parent = {
      ...tree,
      model: tree.model ?? (await pick(tree).model?.(tree)) ?? null,
    };
    const { quick, status, error } = await ctx.quickFor(parent);
    if (error) return json(res, status, { error });
    const prompt = compactionPrompt(tree, anchor.text),
      key = JSON.stringify([prompt, quick]);
    if (prepared.get(id)?.key !== key || prepared.get(id).failed) {
      ctx.unprepare(id);
      const controller = new AbortController(),
        entry = {
          key,
          passage: anchor.text,
          controller,
          run: ctx.compact(prompt, quick, controller),
        };
      prepared.set(id, entry);
      entry.run.catch(() => {
        entry.failed = true;
      }); // reopening the form or submitting after a failure runs again
    }
    return json(res, 202, {});
  }
  if (action === 'stop') {
    active.get(id)?.abort();
    return json(res, 200, {});
  }
  if (active.has(id))
    return json(res, 409, { error: 'This tree is already responding. Stop it or wait.' });
  if (action === 'model') {
    const controller = new AbortController();
    active.set(id, controller);
    try {
      const target = body?.provider ?? tree.provider;
      const model = Object.hasOwn(body ?? {}, 'model') ? body.model : tree.model;
      const effort = Object.hasOwn(body ?? {}, 'effort')
        ? body.effort
        : target === tree.provider && model === tree.model
          ? tree.effort
          : null;
      const invalid = await selectionError({ provider: target, model, effort });
      if (invalid) return json(res, invalid.status, { error: invalid.error });
      if (controller.signal.aborted)
        return json(res, 409, {
          error: 'Model change cancelled. Your previous selection is saved.',
        });
      // A provider switch starts a fresh session that receives the saved discussion on the next reply.
      if (target !== tree.provider) store.switchProvider(id, target, model, effort);
      else store.model(id, model, effort);
      return json(res, 200, { provider: target, model, effort });
    } catch {
      const next = isEndpoint(body.provider ?? tree.provider)
        ? 'Check custom endpoint settings or retry.'
        : `Sign in to ${LABELS[body.provider ?? tree.provider] ?? 'the provider'} or retry.`;
      return json(res, 502, {
        error: `Model change failed. Your previous selection is saved. ${next}`,
      });
    } finally {
      active.delete(id);
    }
  }
  if (action === 'branches') {
    const anchor = anchorOf(tree, body);
    if (anchor?.error) return json(res, 400, anchor);
    if (!anchor || typeof anchor.question !== 'string' || !anchor.question.trim())
      return json(res, 400, {
        error: 'Select a completed tutor passage and enter a question.',
      });
    const controller = new AbortController();
    active.set(id, controller);
    let child;
    try {
      const parent = {
        ...tree,
        model: tree.model ?? (await pick(tree).model?.(tree)) ?? null,
      };
      if (parent.effort !== null) {
        const invalid = await selectionError(parent);
        if (invalid) return json(res, invalid.status, { error: invalid.error });
      }
      const { quick, status, error } = await ctx.quickFor(parent);
      if (error) return json(res, status, { error });
      // The child is saved with an empty snapshot that compaction fills once.
      const prompt = compactionPrompt(tree, anchor.text);
      // Reuse the form-open compaction only if the parent, passage and quick model are unchanged.
      const ready =
        prepared.get(id)?.key === JSON.stringify([prompt, quick]) && !prepared.get(id).failed
          ? prepared.get(id)
          : null;
      if (ready) prepared.delete(id);
      else ctx.unprepare(id);
      child = store.branch(parent, anchor, '');
      ctx.startCompaction(child.id, prompt, quick, ready);
    } finally {
      active.delete(id);
    }
    return json(res, 201, child);
  }
  return sendRoute(res, ctx, id, tree, action, body);
}
