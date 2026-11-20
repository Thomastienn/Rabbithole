import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

test('the piece routes list the library with its saved videos and read one piece compiled for the player', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-pieces-http-')),
        store = new Store(join(dir, 'trees.sqlite')),
        app = createApp({
            store,
            provider: {
                models: async () => [],
                generate: async () => assert.fail('no provider call'),
            },
            dir,
            auth: { status: () => ({ connected: true }) },
        });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        app.stop();
        store.close();
    });
    const get = async (p) => {
        const r = await fetch(`http://127.0.0.1:${app.server.address().port}${p}`);
        return [r.status, await r.json()];
    };
    assert.deepEqual(
        await get('/api/pieces'),
        [200, { total: 0, pieces: [] }],
        'the library starts empty',
    );
    store.db
        .prepare('INSERT INTO videos(id,title,description,duration,created) VALUES (?,?,?,?,?)')
        .run('v1', 'Elections', 'd', 3, 1);
    const source =
        "import { colors } from './kit';\nexport function Winner({ x, y }: { x: number; y: number }) { return <div style={{ left: x, top: y, color: colors.winner }} />; }";
    const id = store.savePiece(
        {
            name: 'Winner',
            look: 'A gold trophy',
            props: ['x', 'y'],
            source,
            roles: ['winner'],
            embedding: [1, 0],
        },
        'v1',
    );
    store.usePiece(id, 'unsaved-video');
    const [status, { pieces: list }] = await get('/api/pieces');
    assert.equal(status, 200);
    assert.deepEqual(
        list.map(({ improved, ...p }) => (assert.ok(improved > 0), p)),
        [
            {
                id,
                name: 'Winner',
                look: 'A gold trophy',
                solid: false,
                still: false,
                still3d: false,
                videos: [{ id: 'v1', title: 'Elections' }],
            },
        ],
        'only saved library videos are listed as users',
    );
    const [, piece] = await get(`/api/pieces/${id}`);
    assert.equal(piece.source, source, 'the original source, unchanged');
    assert.deepEqual(piece.roles, ['winner']);
    assert.equal(piece.embedding, undefined, 'the embedding stays on the server');
    assert.match(piece.code, /exports\.Winner = Winner/);
    assert.match(piece.code, /require\("\.\/kit"\)/);
    assert.doesNotMatch(piece.code, /<div/, 'JSX is compiled away');
    assert.equal(piece.source3d, null, 'a 2D-only piece has no 3D source');
    assert.equal(piece.code3d, null);
    const source3d = 'export function Winner3D() { return <group />; }';
    const solid = store.savePiece({ ...store.piece(id), source3d });
    const [, both] = await get(`/api/pieces/${solid}`);
    assert.equal(both.source3d, source3d, 'the 3D source');
    assert.match(
        both.code3d,
        /exports\.Winner3D = Winner3D/,
        'the 3D form compiles for the player',
    );
    assert.doesNotMatch(both.code3d, /<group/);
    assert.equal((await get('/api/pieces/missing'))[0], 404);
});

test('the piece list route pages and searches, embedding the query with pending pieces and falling back to text', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-pieces-http-')),
        store = new Store(join(dir, 'trees.sqlite')),
        logs = [],
        embedded = [];
    let embedder = async (texts) => (
        embedded.push(texts),
        texts.map((x) => (/rocket|launch/i.test(x) ? [1, 0] : [0, 1]))
    );
    const app = createApp({
        store,
        provider: { models: async () => [], generate: async () => assert.fail('no provider call') },
        dir,
        auth: { status: () => ({ connected: true }) },
        videoEmbed: (texts) => embedder(texts),
        log: (line) => logs.push(line),
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        app.stop();
        store.close();
    });
    const get = async (p) =>
        (await fetch(`http://127.0.0.1:${app.server.address().port}${p}`)).json();
    const piece = (name, look, embedding) =>
        store.savePiece({ name, look, props: [], source: '', roles: [], embedding });
    for (let i = 0; i < 30; i++) piece(`Filler ${i}`, 'A grey pebble', [0, 1]);
    piece('Launch vehicle', 'A tall white launch vehicle', null);
    const all = await get('/api/pieces');
    assert.deepEqual([all.total, all.pieces.length], [31, 24], 'default page of 24');
    const last = await get('/api/pieces?offset=24&limit=24');
    assert.deepEqual([last.total, last.pieces.length], [31, 7]);
    assert.equal((await get('/api/pieces?limit=1000')).pieces.length, 31, 'limit is capped at 100');
    assert.equal(
        (await get('/api/pieces?offset=-5&limit=x')).pieces.length,
        24,
        'bad numbers default',
    );

    const found = await get('/api/pieces?q=rocket');
    assert.deepEqual(
        found.pieces.map((p) => p.name),
        ['Launch vehicle'],
        'meaning match without shared words',
    );
    assert.deepEqual(
        embedded,
        [['rocket', 'A tall white launch vehicle']],
        'pending piece embedded',
    );
    assert.ok(store.piece(found.pieces[0].id).embedding, 'its embedding is saved');
    assert.equal(embedded.length, 1, 'an empty query does not embed');

    embedder = async () => {
        throw new Error('model files missing');
    };
    assert.deepEqual(
        (await get('/api/pieces?q=PEBBLE&limit=2')).total,
        30,
        'with no usable embedder the query matches look text case-insensitively',
    );
    assert.equal((await get('/api/pieces?q=rocket')).total, 0, 'no text match, no results');
    assert.match(
        logs.join('\n'),
        /WARN media piece search fell back to text .*model files missing/,
    );
    assert.doesNotMatch(logs.join('\n'), /rocket/, 'the query stays out of the log');
});

test('the piece list backfills stills through the snapshot path and serves them as JPEG', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-pieces-http-')),
        store = new Store(join(dir, 'trees.sqlite')),
        logs = [],
        shots = [];
    let broken = false;
    const app = createApp({
        store,
        provider: { models: async () => [], generate: async () => assert.fail('no provider call') },
        dir,
        auth: { status: () => ({ connected: true }) },
        log: (line) => logs.push(line),
        // Stands in for the sandboxed Remotion still render: reads the staged entry, writes each JPEG.
        pieceSnapshot: async (workspace, stills) => {
            shots.push({
                entry: readFileSync(join(workspace, 'index.tsx'), 'utf8'),
                pieces: readFileSync(join(workspace, 'pieces.tsx'), 'utf8'),
                solid: existsSync(join(workspace, 'pieces3d.tsx')),
                kit: readFileSync(join(workspace, 'kit.tsx'), 'utf8'),
                frames: stills.map((s) => s.frame),
            });
            if (broken) throw new Error('renderer missing');
            for (const { frame, file } of stills) writeFileSync(file, `jpeg ${frame}`);
            return { stills: stills.length };
        },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        app.stop();
        store.close();
    });
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const list = async () => (await (await fetch(`${base}/api/pieces`)).json()).pieces;
    const piece = (name, source3d) =>
        store.savePiece({
            name,
            look: 'l',
            props: [],
            source: `export function ${name}() { return null; }`,
            source3d,
            roles: ['winner'],
        });
    const flat = piece('Flat'),
        solid = piece('Solid', 'export function Solid3D() { return <group />; }');
    assert.equal((await fetch(`${base}/api/pieces/${flat}/still`)).status, 404, 'no still yet');
    await list();
    for (let i = 0; i < 50 && store.unstilledPieces().length; i++)
        await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(store.unstilledPieces(), [], 'listing backfills pieces saved without stills');
    const [one, two] = shots;
    assert.deepEqual([one.frames, one.solid, two.frames, two.solid], [[0], false, [0, 1], true]);
    assert.match(one.pieces, /export function Flat/);
    assert.match(one.entry, /\(flat as any\)\["Flat"\]/);
    assert.doesNotMatch(one.entry, /ThreeCanvas/, 'a 2D-only piece renders no 3D frame');
    assert.match(
        two.entry,
        /ThreeCanvas[\s\S]*\(solid as any\)\["Solid3D"\]|\(solid as any\)\["Solid3D"\][\s\S]*ThreeCanvas/,
    );
    assert.match(one.kit, /"winner": palette\.amber/, 'roles borrow house hues');
    assert.equal(existsSync(join(dir, 'piece-work', flat)), false, 'the workspace is removed');
    assert.deepEqual(
        (await list()).map((p) => [p.name, p.solid, p.still, p.still3d]),
        [
            ['Solid', true, true, true],
            ['Flat', false, true, false],
        ],
    );
    const res = await fetch(`${base}/api/pieces/${solid}/still3d`);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.equal(await res.text(), 'jpeg 1');
    assert.equal(await (await fetch(`${base}/api/pieces/${solid}/still`)).text(), 'jpeg 0');
    assert.equal((await fetch(`${base}/api/pieces/${flat}/still3d`)).status, 404);

    broken = true;
    const bad = piece('Bad');
    const before = shots.length;
    await list();
    for (let i = 0; i < 50 && !logs.some((l) => /piece stills failed/.test(l)); i++)
        await new Promise((r) => setTimeout(r, 10));
    assert.match(logs.join('\n'), /WARN media piece stills failed .*renderer missing/);
    await list();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(shots.length, before + 1, 'a failed piece is not rendered again on each list');
    assert.deepEqual(
        (await list()).find((p) => p.id === bad).still,
        false,
        'the card keeps waiting for its still',
    );
});
