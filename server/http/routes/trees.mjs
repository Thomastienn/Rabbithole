import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mediaPath } from '../../media/videos.mjs';
import { pythonWorkspace } from '../../tools/python.mjs';
import { LABELS, isEndpoint } from '../roles.mjs';
import { anchorOf, compactionPrompt } from '../jobs/compaction.mjs';
import { sendRoute } from './send.mjs';
import { IMAGE_TYPES } from '../../attachments.mjs';

// Learning trees: create, read, rename, delete, layout, model changes and branching; send and retry live in send.mjs.
export async function treeRoutes(req, res, url, ctx, body) {
    const { store, json, providers, active, compactions, prepared, pick, selectionError } = ctx;
    if (req.method === 'GET') {
        // A saved attachment, scoped to its conversation; served as inert text or a download, never as app content.
        const file = url.pathname.match(/^\/api\/trees\/([^/]+)\/attachments\/([^/]+)$/);
        const attachment = file && store.attachment(file[1], file[2]);
        if (file && !attachment) return json(res, 404, { error: 'Attachment not found.' });
        if (attachment) {
            const data = readFileSync(join(ctx.dir, 'attachments', file[1], attachment.id));
            const text = attachment.delivery === 'text' && attachment.type !== 'application/pdf',
                image = IMAGE_TYPES.includes(attachment.type);
            const ascii = attachment.name.replace(/[^\x20-\x7e]|["\\]/g, '_');
            res.writeHead(200, {
                'Content-Type': text
                    ? 'text/plain; charset=utf-8'
                    : image
                      ? attachment.type
                      : 'application/octet-stream',
                'Content-Disposition': `${text || image ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
                'Content-Security-Policy': "sandbox; default-src 'none'",
                'Content-Length': data.length,
            });
            res.end(data);
            return true;
        }
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
                ? {
                      ...tree,
                      // Prepared attachment text is for the models; the client shows chips and opens the file.
                      messages: tree.messages.map((m) =>
                          m.attachments
                              ? { ...m, attachments: m.attachments.map(({ text, ...a }) => a) }
                              : m,
                      ),
                      artifacts: tree.artifacts.map(ctx.live),
                      ...preparing,
                  }
                : { error: 'Learning tree not found.' },
        );
    }
    if (req.method !== 'POST') return false;
    if (url.pathname === '/api/trees') {
        // New chat saves nothing; the client creates the tree on the first send with the chosen model.
        const explicit = ['provider', 'model', 'effort'].some((key) =>
            Object.hasOwn(body ?? {}, key),
        );
        const selection = explicit
            ? { provider: body.provider, model: body.model, effort: body.effort ?? null }
            : ctx.chatDefault();
        // No chat model chosen yet: the tree has no provider and Send asks for one.
        if (!explicit && !selection.provider) return json(res, 201, store.create());
        if (!Object.hasOwn(providers, selection.provider))
            return json(res, 400, {
                error: 'Chat default provider is unavailable. Configure it in Connections or change the chat default in Models.',
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
                (await providers[selection.provider].model?.({ model: null, thread: null })) ??
                null;
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
        /^\/api\/trees\/([^/]+)\/(messages|retry|stop|branches|prepare|unprepare|position|layout|model|rename|delete|brief)$/,
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
            (body.count !== undefined &&
                body.count !== store.descendants(body.conversation).length) ||
            (body.title !== undefined && body.title !== store.tree(body.conversation).title)
        )
            return json(res, 409, {
                error: 'This chat changed since confirmation. Cancel and try again to review the current conversations.',
            });
        const { dir, videoJobs } = ctx;
        const staged = [],
            files = [];
        let result;
        try {
            result = store.remove(id, body.conversation, (artifacts) => {
                // Move files reversibly before commit; an SQL or filesystem failure restores their original names.
                for (const a of artifacts.filter((a) => a.kind === 'video')) {
                    // Library videos keep their media and the production work their live playback needs.
                    for (const path of [
                        ...(store.libraryVideo(a.id)
                            ? []
                            : [mediaPath(dir, a.id), join(dir, 'video-work', a.id)]),
                        ...(a.attempt ? [join(dir, 'video-work', a.attempt)] : []),
                    ]) {
                        files.push(path);
                        // Live jobs can have filesystem operations in flight; stop and remove those after commit.
                        if (
                            [...videoJobs].some((job) => job.artifact === a.id) ||
                            !existsSync(path)
                        )
                            continue;
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
            for (const job of ctx.discussing.values())
                if (job.conversation === conversation) job.controller.abort();
            for (const [key, job] of compactions)
                if (key.startsWith('discussion:') && job.conversation === conversation) {
                    job.controller.abort();
                    compactions.delete(key);
                }
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
        // shortcut: attachment folders are removed after commit, so a crash in between leaves files behind; stage them like videos if that matters.
        for (const conversation of result.deleted) {
            rmSync(join(dir, 'attachments', conversation), { recursive: true, force: true });
            rmSync(pythonWorkspace(dir, conversation), { recursive: true, force: true });
        }
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
        const { folded, selected, panel, viewport, positions = {}, ghosts } = body;
        const coordinate = (n) => Number.isFinite(n) && Math.abs(n) <= 1000000;
        const owned = new Set(store.descendants(id)); // positions may only move conversations inside this root's tree
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
            ) ||
            // Ghost tree positions, keyed by the other tree's root.
            !(
                ghosts === undefined ||
                (ghosts &&
                    typeof ghosts === 'object' &&
                    !Array.isArray(ghosts) &&
                    Object.keys(ghosts).length <= 1000 &&
                    Object.entries(ghosts).every(
                        ([g, at]) => g.length <= 100 && at && coordinate(at.x) && coordinate(at.y),
                    ))
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
                ...(ghosts && {
                    ghosts: Object.fromEntries(
                        Object.entries(ghosts).map(([g, at]) => [g, { x: at.x, y: at.y }]),
                    ),
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
    // A brief explanation of a tutor reply passage: saved one at once, else one quick thinking call, returned whole.
    // It runs beside the reply, so a suggestion opened while the reply streams is explained from its text so far.
    if (action === 'brief') {
        const anchor = anchorOf(tree, body, true);
        if (!anchor || anchor.error || anchor.artifactId || anchor.groundwork)
            return json(res, 400, { error: 'Select a passage of a completed tutor reply.' });
        const { messageId: message, start, end, text } = anchor;
        const saved = store.brief(message, start, end);
        if (saved) return json(res, 200, { explanation: saved });
        // Only the reply's own suggestion supplies a concept; a selected passage carries none.
        const concept = tree.suggestions
            .find((s) => s.message === message && s.status === 'ready')
            ?.passages.find((p) => p.start === start && p.end === end)?.concept;
        const reply = tree.messages.find((m) => m.id === message).text;
        try {
            const explanation = await ctx.writeBrief(id, reply, {
                message,
                start,
                end,
                text,
                concept,
            });
            return json(res, 200, { explanation });
        } catch {
            return json(res, 502, { error: 'Brief explanation failed. Retry.' });
        }
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
                prepared.get(id)?.key === JSON.stringify([prompt, quick]) &&
                !prepared.get(id).failed
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
    const controller = new AbortController();
    active.set(id, controller);
    try {
        return await sendRoute(res, ctx, id, tree, action, body, controller);
    } finally {
        if (active.get(id) === controller) active.delete(id);
    }
}
