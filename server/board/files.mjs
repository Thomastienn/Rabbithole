import { join } from 'node:path';
import { withAttachments } from '../attachments.mjs';
import { attachmentParts, prepareUploads, savePrepared } from '../http/attachments.mjs';

// A board question's files arrive in its ask message as [{ name, type, data }], data in base64.
const fileList = (files) =>
    Array.isArray(files) &&
    files.every(
        (f) =>
            typeof f?.name === 'string' && typeof f.type === 'string' && typeof f.data === 'string',
    );

// Prepares them as a chat send does (docs/board-spec.md, Attachments); throws with the learner-facing reason.
async function prepareFiles(ctx, tree, files) {
    return prepareUploads(
        files.map((f) => new File([Buffer.from(f.data, 'base64')], f.name, { type: f.type })),
        { readsImages: await ctx.readsImages(tree), recognize: ctx.recognize },
    );
}

// An ask message: files are prepared before the turn starts; a refused one is said as a notice, and nothing is asked.
export function boardAsk(ctx, id, m, ask, send) {
    const text = m.text.slice(0, 100000);
    if (!m.files?.length) return ask(text);
    if (!fileList(m.files)) return;
    prepareFiles(ctx, ctx.store.tree(id), m.files).then(
        (files) => ask(text, 0, files),
        (error) => {
            send({ type: 'notice', notice: error.message });
            send({ type: 'state', state: 'idle' });
        },
    );
}

// Saves the prepared files on the learner's question; returns the prompt with their text and the images to send.
export function attachBoardFiles(ctx, id, user, text, prepared) {
    if (!prepared.length) return { prompt: text, images: [] };
    const folder = join(ctx.dir, 'attachments', id);
    savePrepared(prepared, folder);
    ctx.store.attach(id, user, prepared);
    const images = attachmentParts('', prepared, folder).flatMap((p) => (p.image ? [p.image] : []));
    return { prompt: withAttachments(text, prepared), images };
}
