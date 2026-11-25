import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { compactionPrompt } from '../../server/http/jobs/compaction.mjs';
import { OCR_UNAVAILABLE } from '../../server/ocr.mjs';

const fixture = (name) => readFileSync(new URL(`../fixtures/pdf/${name}.pdf`, import.meta.url));
async function start(t) {
    const dir = mkdtempSync(join(tmpdir(), 'rabbithole-pdf-send-')),
        store = new Store(join(dir, 'trees.sqlite')),
        calls = [];
    let unavailable = false;
    const provider = {
        readsImages: true,
        fail: false,
        generate: async (tree, text, emit) => {
            calls.push({ tree, text });
            if (provider.fail) throw new Error('Provider unavailable');
            emit({ type: 'item', item: 'a', text: 'An answer.' });
            emit({ type: 'status', status: 'completed' });
        },
    };
    const app = createApp({
        store,
        dir,
        provider,
        recognize: async (bytes) => {
            assert.equal(Buffer.from(bytes).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
            if (unavailable)
                throw Object.assign(new Error('download failed'), { unavailable: true });
            return 'Recognised notes';
        },
        auth: { status: () => ({ connected: true }) },
        log: () => {},
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await app.stop();
        store.close();
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const id = store.create('PDF', 'codex').id;
    const post = (action, body = {}) =>
        fetch(`${origin}/api/trees/${id}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const upload = (name = 'ordered') => {
        const form = new FormData();
        form.set('text', 'Explain');
        form.append('files', new File(['Text first'], 'notes.txt', { type: 'text/plain' }));
        form.append('files', new File([fixture(name)], `${name}.pdf`, { type: 'application/pdf' }));
        form.append(
            'files',
            new File([readFileSync(new URL('../fixtures/ocr.png', import.meta.url))], 'last.png', {
                type: 'image/png',
            }),
        );
        return fetch(`${origin}/api/trees/${id}/messages`, {
            method: 'POST',
            headers: { 'X-Rabbithole-CSRF': csrf },
            body: form,
        });
    };
    return {
        dir,
        store,
        provider,
        calls,
        origin,
        id,
        post,
        upload,
        unavailable: (value) => {
            unavailable = value;
        },
    };
}

test('multipart PDF reaches a fake provider in page order; storage, history and deletion retain their boundaries', async (t) => {
    const { dir, store, provider, calls, origin, id, post, upload } = await start(t);
    provider.fail = true;
    const stream = await (await upload()).text();
    assert.match(stream, /"status":"failed"/);
    const saved = JSON.parse(
        stream
            .split('\n')
            .find((l) => l.startsWith('data: '))
            .slice(6),
    );
    assert.ok(saved.user.attachments.every((a) => !a.parts && !a.bytes && !a.text));
    const [question, failed] = store.tree(id).messages;
    const pdf = question.attachments[1],
        folder = join(dir, 'attachments', id);
    assert.equal(pdf.delivery, 'text,image');
    assert.deepEqual(
        calls[0].tree.parts.map((p) => (p.image ? 'image' : p.text.split('\n').at(-1))),
        [
            'Explain',
            'Text first',
            'Parent child',
            'A large figure',
            '[image: ordered.pdf, page 2, image 1]',
            'image',
            'Figure caption',
            '[image: ordered.pdf, page 3, image 1]',
            'image',
            'Vector label',
            '[image: last.png]',
            'image',
        ],
    );
    assert.equal(calls[0].tree.images.length, 3);
    for (const image of calls[0].tree.images.slice(0, 2)) {
        assert.equal(readFileSync(image.path).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(statSync(image.path).mode & 0o777, 0o600);
    }
    assert.deepEqual(readFileSync(join(folder, pdf.id)), fixture('ordered'));
    assert.equal(readdirSync(folder).length, 5, 'three originals and two extracted images');
    assert.doesNotMatch(calls[0].text, /WRONG hidden OCR/);
    assert.match(
        compactionPrompt(store.tree(id), 'An answer.'),
        /Binary heaps.*ordered.pdf, page 2, image 1/,
    );

    // A fresh app tree read exposes only chip metadata; the original PDF downloads as a PDF, never text.
    const tree = await (await fetch(`${origin}/api/trees/${id}`)).json();
    assert.ok(tree.messages[0].attachments.every((a) => !a.parts && !a.text && !a.bytes));
    const asset = await fetch(`${origin}/api/trees/${id}/attachments/${pdf.id}`);
    assert.equal(asset.headers.get('content-type'), 'application/octet-stream');
    assert.match(asset.headers.get('content-disposition'), /^attachment; filename="ordered.pdf"/);
    assert.deepEqual(Buffer.from(await asset.arrayBuffer()), fixture('ordered'));

    // Retry reparses the saved PDF and rebuilds ordered images, preserving the learner message.
    provider.fail = false;
    await (await post('retry')).text();
    assert.deepEqual(calls[1].tree.parts, calls[0].tree.parts);
    assert.equal(store.tree(id).messages[0].id, question.id);
    assert.notEqual(store.tree(id).messages[1].id, failed.id);
    store.forgetThread(id);
    await (await post('messages', { text: 'Next' })).text();
    assert.equal(calls[2].tree.parts, undefined);
    assert.equal(calls[2].tree.images, undefined);
    assert.match(calls[2].tree.messages[0].text, /Binary heaps.*\n.*Parent child/);
    assert.match(calls[2].tree.messages[0].text, /\[image: ordered.pdf, page 3, image 1\]/);
    await (await post('delete', { conversation: id })).text();
    assert.ok(!existsSync(folder));
});

test('an oversized PDF refuses the whole send and saves nothing', async (t) => {
    const { dir, store, calls, id, upload } = await start(t);
    const refused = await upload('pictures');
    assert.equal(refused.status, 400);
    assert.match(
        (await refused.json()).error,
        /^pictures\.pdf: .*Attach only the pages you need\.$/,
    );
    assert.equal(store.tree(id).messages.length, 0);
    assert.ok(!existsSync(join(dir, 'attachments', id)));
    assert.equal(calls.length, 0);
});

test('PDF OCR refuses atomically, retries after failure, and follows model capability on a failed reply', async (t) => {
    const { dir, store, provider, calls, id, post, upload, unavailable } = await start(t);
    provider.readsImages = false;
    unavailable(true);
    const refused = await upload();
    assert.equal(refused.status, 400);
    assert.equal((await refused.json()).error, OCR_UNAVAILABLE);
    assert.equal(store.tree(id).messages.length, 0);
    assert.ok(!existsSync(join(dir, 'attachments', id)));
    assert.equal(calls.length, 0);

    unavailable(false);
    provider.fail = true;
    await (await upload('figure')).text();
    assert.equal(calls[0].tree.images, undefined);
    assert.ok(calls[0].tree.parts.every((p) => !p.image));
    const original = store.tree(id).messages;
    assert.equal(original[0].attachments[1].delivery, 'text,ocr');
    assert.match(
        calls[0].text,
        /A large figure\n\n\[image: figure.pdf, page 1, image 1, read by OCR\]\nRecognised notes/,
    );
    unavailable(true);
    const retryRefused = await post('retry');
    assert.equal(retryRefused.status, 400);
    assert.deepEqual(store.tree(id).messages, original);
    assert.equal(calls.length, 1);

    // Native retry succeeds at preparation even while OCR is unavailable.
    provider.readsImages = true;
    await (await post('retry')).text();
    assert.equal(calls[1].tree.images.length, 2);
    assert.equal(store.tree(id).messages[0].attachments[1].delivery, 'text,image');
    assert.doesNotMatch(calls[1].text, /read by OCR|Recognised notes/);

    provider.readsImages = false;
    provider.fail = false;
    unavailable(false);
    assert.match(await (await post('retry')).text(), /"status":"completed"/);
    assert.equal(store.tree(id).messages[0].id, original[0].id);
    assert.equal(store.tree(id).messages[0].attachments[1].delivery, 'text,ocr');
    assert.equal(calls[2].tree.images, undefined);
    assert.ok(calls[2].tree.parts.every((p) => !p.image));
    assert.match(calls[2].text, /read by OCR\]\nRecognised notes/);
});

test('a text-only PDF chip downloads the unchanged original bytes with an inert binary type', async (t) => {
    const { store, origin, id, upload } = await start(t);
    await (await upload('typed')).text();
    const pdf = store.tree(id).messages[0].attachments[1];
    assert.equal(pdf.delivery, 'text');
    const asset = await fetch(`${origin}/api/trees/${id}/attachments/${pdf.id}`);
    assert.equal(asset.headers.get('content-type'), 'application/octet-stream');
    assert.match(asset.headers.get('content-disposition'), /^attachment;/);
    assert.equal(asset.headers.get('content-security-policy'), "sandbox; default-src 'none'");
    assert.deepEqual(Buffer.from(await asset.arrayBuffer()), fixture('typed'));
});
