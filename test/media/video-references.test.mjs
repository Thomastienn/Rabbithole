import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { generateVideo } from '../../server/media/videos.mjs';
import { AUDIT_INSTRUCTIONS } from '../../server/media/video-cut.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';
import { planFor, planText, complete, fakeRender, audit, pass } from '../support/video-kit.mjs';

const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
    Buffer.alloc(32, 7),
]);
const pieces = `import { palette } from './kit';
export function Winner({ x, y }) {
  return <div style={{ position: 'absolute', left: x, top: y, width: 240, height: 120, background: palette.raised }}>Winner</div>;
}
export function Trophy({ x, y }) {
  return <div style={{ position: 'absolute', left: x, top: y, width: 80, height: 80, background: palette.raised }}>Cup</div>;
}`;
// Cut 1 draws the Winner, cut 2 only the Trophy.
const cutDrawing = (name) => `import { AbsoluteFill } from 'remotion';
import { ${name} } from './pieces';
export default function Video() { return <AbsoluteFill><${name} x={800} y={400} /></AbsoluteFill>; }`;

async function run({ photo = true, readsImages = true } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'tt-video-references-'));
    const store = new Store(join(dir, 'trees.sqlite'));
    const tree = store.create('Video', 'codex');
    const message = store.message(tree.id, 'assistant', 'Reply.', 'completed');
    const artifact = store.pendingArtifact(
        tree.id,
        message,
        'Title',
        'Planned.',
        'video',
        '{"request":"Make a video."}',
    );
    const plan = planFor(undefined, 2);
    plan.styleBrief.recurringObjects = [
        {
            name: 'Winner',
            position: 'centre',
            look: 'A Saturn V rocket 120x600 px.',
            referenceQuery: 'Saturn V rocket',
        },
        { name: 'Trophy', position: 'left', look: 'A cup 80x80 px.' },
    ];
    const calls = [],
        searches = [],
        staged = [],
        warnings = [];
    const result = await generateVideo({
        provider: {
            generate: async (t, text, emit) => {
                const call = {
                    instructions: t.instructions,
                    input: JSON.parse(text),
                    images: t.images,
                };
                calls.push(call);
                if (t.instructions.startsWith('You plan')) return complete(emit, planText(plan));
                if (t.instructions.startsWith('You write the set pieces'))
                    return complete(emit, pieces);
                if (t.instructions.startsWith(AUDIT_INSTRUCTIONS)) {
                    call.photos = (t.images ?? [])
                        .filter((i) => i.type === 'image/png')
                        .map((i) => readFileSync(i.path));
                    return audit(t, emit, pass);
                }
                complete(
                    emit,
                    cutDrawing(call.input.cut.purpose === 'Step 1' ? 'Winner' : 'Trophy'),
                );
            },
        },
        selection: {},
        store,
        dir,
        artifact,
        signal: new AbortController().signal,
        render: async (workspace, output, ...rest) => {
            if (existsSync(join(workspace, 'stock.json')))
                staged.push(readFileSync(join(workspace, 'stock.json'), 'utf8'));
            return fakeRender(workspace, output, ...rest);
        },
        snapshot: async (_dir, list) => {
            for (const { file } of list) writeFileSync(file, 'jpeg');
        },
        narrate: fakeNarration,
        onWarning: (w) => warnings.push(w),
        search: { status: async () => ({ ready: true }) },
        exhibit: async (p) => {
            searches.push(p);
            if (!photo) throw new Error('no search results for "Saturn V rocket"');
            return {
                kind: 'image',
                url: 'https://nasa.example/saturn.png',
                title: 'Saturn V',
                site: 'nasa.example',
                bytes: png,
                type: 'image/png',
            };
        },
        clips: () => ({ ready: false }),
        readsImages,
    }).then(
        () => null,
        (error) => error.message,
    );
    return {
        result,
        calls,
        searches,
        staged,
        warnings,
        store,
        tree,
        row: store.artifact(tree.id, artifact.id),
    };
}

test('a reference query fetches one photo before set pieces are drawn; the piece writer and the audit of the cut drawing it see it; the tree keeps it as a resource; no cut shows it', async () => {
    const { result, calls, searches, staged, store, tree, row } = await run();
    assert.equal(result, null);
    assert.equal(row.status, 'ready');
    assert.deepEqual(searches, [{ kind: 'image', query: 'Saturn V rocket' }]);
    const writer = calls.find((c) => c.instructions.startsWith('You write the set pieces'));
    assert.deepEqual(writer.input.referencePhotos, ['Winner']);
    assert.equal(writer.images.length, 1);
    assert.deepEqual(readFileSync(writer.images[0].path), png);
    const audits = calls.filter((c) => c.instructions.startsWith(AUDIT_INSTRUCTIONS));
    const winner = audits.find((a) => a.input.cut.purpose === 'Step 1'),
        trophy = audits.find((a) => a.input.cut.purpose === 'Step 2');
    assert.deepEqual(winner.input.referencePhotos, ['Winner']);
    assert.deepEqual(winner.photos, [png]);
    assert.equal(trophy.input.referencePhotos, undefined);
    assert.deepEqual(trophy.photos, []);
    assert.deepEqual(
        store.resources(tree.id).map((r) => [r.url, r.title, r.kind]),
        [['https://nasa.example/saturn.png', 'Saturn V', 'image']],
    );
    // No cut's host data carries the photo, and no cut writer is handed it.
    assert.ok(staged.every((s) => !s.includes('saturn')));
    assert.ok(
        calls
            .filter((c) => c.input.cut && !c.instructions.startsWith(AUDIT_INSTRUCTIONS))
            .every((c) => !c.images),
    );
});

test('a set piece writer that cannot read images gets no photo, while the audit still does', async () => {
    const { result, calls } = await run({ readsImages: false });
    assert.equal(result, null);
    const writer = calls.find((c) => c.instructions.startsWith('You write the set pieces'));
    assert.equal(writer.images, undefined);
    assert.equal(writer.input.referencePhotos, undefined);
    const audit = calls.find(
        (c) => c.instructions.startsWith(AUDIT_INSTRUCTIONS) && c.input.cut.purpose === 'Step 1',
    );
    assert.deepEqual(audit.photos, [png]);
});

test('a failed or empty reference search lets the video continue without a photo', async () => {
    const { result, calls, warnings, store, tree, row } = await run({ photo: false });
    assert.equal(result, null);
    assert.equal(row.status, 'ready');
    assert.ok(warnings.some((w) => w.includes('reference photo skipped')));
    assert.ok(calls.every((c) => c.input.referencePhotos === undefined));
    assert.deepEqual(store.resources(tree.id), []);
});
