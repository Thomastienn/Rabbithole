import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { playable } from '../../server/media/cut-state.mjs';
import { readSaved } from '../../server/media/video-workspace.mjs';
import { Store } from '../../server/store.mjs';

const entry = (name, embedding) => ({
    name,
    look: `${name} look`,
    props: ['x', 'y', 'scale', 'highlight', 'state'],
    source: `export function ${name}() { return null; }`,
    roles: ['winner'],
    embedding,
});

test('the piece library saves pieces, reads embeddings back, ranks the top 5 by cosine and records videos', (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-pieces-')), 'trees.sqlite'));
    t.after(() => store.close());
    assert.deepEqual(store.nearestPieces([1, 0]), [], 'the library starts empty');
    const ids = [0, 1, 2, 3, 4, 5, 6].map((i) =>
        store.savePiece(entry(`P${i}`, [Math.cos(i / 4), Math.sin(i / 4), 0]), 'video-a'),
    );
    const bare = store.savePiece(entry('Bare', null), 'video-a');
    const piece = store.piece(ids[2]);
    assert.equal(piece.name, 'P2');
    assert.deepEqual(piece.props, entry().props);
    assert.deepEqual(piece.roles, ['winner']);
    assert.equal(piece.embedding.length, 3);
    assert.ok(Math.abs(piece.embedding[0] - Math.cos(0.5)) < 1e-6, 'Float32 blob round-trips');
    assert.ok(piece.created > 0 && piece.improved === piece.created);
    assert.equal(store.piece(bare).embedding, null);
    const top = store.nearestPieces([Math.cos(1.5), Math.sin(1.5), 0]);
    assert.deepEqual(
        top.map((p) => p.name),
        ['P6', 'P5', 'P4', 'P3', 'P2'],
        'top 5 by cosine; unembedded pieces are skipped',
    );
    assert.ok(top[0].score > top[1].score);
    store.usePiece(ids[0], 'video-b');
    store.usePiece(ids[0], 'video-b');
    assert.deepEqual(store.piece(ids[0]).videos, ['video-a', 'video-b']);
});

test('the piece list pages newest-improved first and searches by meaning or, without a vector, by name and look text', (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-pieces-')), 'trees.sqlite'));
    t.after(() => store.close());
    assert.deepEqual(store.pieceList(), { total: 0, pieces: [] });
    const save = (name, look, embedding) => {
        const id = store.savePiece({ ...entry(name, embedding), look });
        store.db
            .prepare('UPDATE pieces SET improved=? WHERE id=?')
            .run(store.pieceList().total, id);
        return id;
    };
    save('Rocket', 'A tall launch vehicle', [1, 0]);
    save('Tree', 'An OAK with green leaves', [0, 1]);
    save('Ship', 'A rusty cargo vessel', [0.8, 0.6]);
    save('Old', 'Saved before embeddings', null);
    const names = (list) => list.pieces.map((p) => p.name);
    assert.deepEqual(names(store.pieceList()), ['Old', 'Ship', 'Tree', 'Rocket']);
    const page = store.pieceList({ offset: 1, limit: 2 });
    assert.deepEqual([page.total, names(page)], [4, ['Ship', 'Tree']], 'one page, total of all');
    assert.deepEqual(names(store.pieceList({ query: 'oak' })), ['Tree'], 'case-insensitive look');
    assert.deepEqual(names(store.pieceList({ query: 'SHIP' })), ['Ship'], 'case-insensitive name');
    assert.deepEqual(store.pieceList({ query: 'zebra' }), { total: 0, pieces: [] });
    assert.deepEqual(
        names(store.pieceList({ query: 'spacecraft', vector: [1, 0] })),
        ['Rocket', 'Ship'],
        'ranked by cosine; distant and unembedded pieces drop out',
    );
    assert.deepEqual(
        names(store.pieceList({ query: 'old', vector: [1, 0] })),
        ['Old', 'Rocket', 'Ship'],
        'a text match still counts, and ranks first, under semantic search',
    );
});

test('a piece keeps an optional 3D form, improved together with its 2D form; older pieces load 2D-only', (t) => {
    const file = join(mkdtempSync(join(tmpdir(), 'tt-pieces-')), 'trees.sqlite');
    let store = new Store(file);
    const source3d = 'export function Solid3D() { return <group />; }';
    const solid = store.savePiece({ ...entry('Solid', null), source3d });
    assert.equal(store.piece(solid).source3d, source3d);
    assert.equal(store.piece(store.savePiece(entry('Flat', null))).source3d, null);
    store.improvePiece(solid, { source: 'two', source3d: 'three', props: ['x'], roles: [] });
    assert.deepEqual(
        [store.piece(solid).source, store.piece(solid).source3d],
        ['two', 'three'],
        'both forms are replaced together',
    );
    // A library saved before 3D forms has no source3d column.
    store.db.exec('DELETE FROM pieces; ALTER TABLE pieces DROP COLUMN source3d');
    store.db
        .prepare(
            "INSERT INTO pieces(id,name,look,props,source,roles,created,improved) VALUES ('old','Old','old look','[]','src','[]',1,1)",
        )
        .run();
    store.close();
    store = new Store(file);
    t.after(() => store.close());
    assert.deepEqual([store.piece('old').source, store.piece('old').source3d], ['src', null]);
});

test('a piece keeps stills of both forms until it is improved; the list says which stills and forms exist', (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-pieces-')), 'trees.sqlite'));
    t.after(() => store.close());
    const flat = store.savePiece(entry('Flat', null)),
        solid = store.savePiece({
            ...entry('Solid', null),
            source3d: 'export function Solid3D() {}',
        });
    assert.deepEqual(
        store.unstilledPieces().map((p) => p.id),
        [flat, solid],
        'new pieces wait for stills, oldest first',
    );
    const flags = () =>
        Object.fromEntries(
            store.pieceList().pieces.map((p) => [p.name, [p.solid, p.still, p.still3d]]),
        );
    assert.deepEqual(flags(), { Flat: [false, false, false], Solid: [true, false, false] });
    const { improved } = store.piece(solid);
    store.stillPiece(flat, store.piece(flat).improved, { still: Buffer.from('2d') });
    store.stillPiece(solid, improved, { still: Buffer.from('a'), still3d: Buffer.from('b') });
    assert.deepEqual(flags(), { Flat: [false, true, false], Solid: [true, true, true] });
    assert.equal(Buffer.from(store.pieceStill(solid, '2d')).toString(), 'a');
    assert.equal(Buffer.from(store.pieceStill(solid, '3d')).toString(), 'b');
    assert.equal(store.pieceStill(flat, '3d'), null);
    assert.deepEqual(store.unstilledPieces(), []);
    store.db.prepare('UPDATE pieces SET improved=improved-1 WHERE id=?').run(solid);
    store.improvePiece(solid, { source: 's', source3d: 't', props: [], roles: [] });
    assert.equal(store.pieceStill(solid, '2d'), null, 'an improvement drops its old stills');
    store.stillPiece(solid, improved - 1, { still: Buffer.from('stale') });
    assert.equal(
        store.pieceStill(solid, '2d'),
        null,
        'stills of an older improvement are not stored',
    );
    assert.deepEqual(
        store.unstilledPieces().map((p) => p.id),
        [solid],
    );
});

test('a piece records the saved parts it is built from; its tree carries their current versions; older pieces have none', (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-pieces-')), 'trees.sqlite'));
    t.after(() => store.close());
    const person = store.savePiece(entry('Person', null), 'video-a');
    const town = store.savePiece(
        { ...entry('Town', null), parts: [{ name: 'Person', id: person }] },
        'video-a',
    );
    const city = store.savePiece(
        { ...entry('City', [1, 0]), parts: [{ name: 'Town', id: town }] },
        'video-a',
    );
    assert.deepEqual(store.piece(city).parts, [{ name: 'Town', id: town }], 'refers, never copies');
    assert.doesNotMatch(store.piece(city).source, /Person|Town/);
    store.improvePiece(person, {
        source: 'export function Person() { return "better"; }',
        props: ['x', 'y'],
        roles: [],
    });
    const tree = store.nearestPieces([1, 0])[0];
    assert.equal(
        tree.parts[0].piece.parts[0].piece.source,
        'export function Person() { return "better"; }',
    );
    assert.deepEqual(
        store.piece(town).parts,
        [{ name: 'Person', id: person }],
        'improving keeps parts',
    );
    store.db.prepare('UPDATE pieces SET parts=NULL WHERE id=?').run(town);
    assert.deepEqual(store.pieceTree(town).parts, [], 'pieces saved before parts load without any');
});

test('a one-time cleanup backs up, then folds pieces sharing a name into one with every version and video link', (t) => {
    const path = join(mkdtempSync(join(tmpdir(), 'tt-pieces-')), 'trees.sqlite');
    let store = new Store(path);
    t.after(() => store.close());
    const tree = store.create('Earth videos', 'codex');
    const reply = store.message(tree.id, 'assistant', 'Two Earth videos.', 'completed');
    const oldSource = entry('Earth').source;
    const newSource = 'export function Earth() { return 2; }';
    const saveVideo = (source) => {
        const { id, attempt } = store.pendingArtifact(tree.id, reply, 'Earth', 'One cut.', 'video');
        store.videoData(tree.id, id, attempt, {
            plan: { styleBrief: { paletteRoles: {} }, cuts: [{}] },
            pieces: source,
            cuts: [
                {
                    engine: 'remotion',
                    code: 'export default function Video() { return null; }',
                    timing: { durationInFrames: 30 },
                    audited: true,
                },
            ],
        });
        store.finishVideo(tree.id, id, attempt, { description: 'One cut.', duration: 1 });
        return id;
    };
    const videoA = saveVideo(oldSource);
    const videoB = saveVideo(newSource);
    const older = store.savePiece(entry('Earth', [1, 0]), videoA);
    store.improvePiece(older, {
        ...entry('Earth'),
        source: 'export function Earth() { return 1; }',
    });
    const moon = store.savePiece({ ...entry('Moon'), parts: [{ name: 'Earth', id: older }] });
    const newest = store.savePiece(
        { ...entry('Earth', [0, 1]), source: newSource, parts: [{ name: 'Moon', id: moon }] },
        videoB,
    );
    store.usePiece(older, videoB);
    const scene = store.savePiece({ ...entry('Scene'), parts: [{ name: 'Earth', id: older }] });
    const updateTime = store.db.prepare('UPDATE pieces SET improved=? WHERE id=?');
    updateTime.run(2, older);
    updateTime.run(3, newest);
    store.db.prepare('UPDATE piece_versions SET improved=1 WHERE piece=?').run(older);
    // Another cleanup is recorded, but the piece cleanup hasn't run.
    store.db.exec("UPDATE cleanups SET name='another-cleanup'");
    store.close();

    store = new Store(path);
    assert.ok(store.backupPath, 'the database is backed up first');
    const saved = new DatabaseSync(store.backupPath, { readOnly: true });
    assert.equal(saved.prepare("SELECT COUNT(*) AS n FROM pieces WHERE name='Earth'").get().n, 2);
    saved.close();
    const earths = store.db.prepare("SELECT id FROM pieces WHERE name='Earth'").all();
    assert.deepEqual(
        earths.map((r) => r.id),
        [newest],
        'one Earth remains, the newest current',
    );
    assert.equal(store.piece(newest).source, newSource);
    assert.deepEqual(store.piece(newest).videos, [videoB, videoA]);
    assert.deepEqual(
        store.db
            .prepare('SELECT source FROM piece_versions WHERE piece=? ORDER BY improved, rowid')
            .all(newest)
            .map((r) => r.source),
        [oldSource, 'export function Earth() { return 1; }'],
        'both older versions are kept under the remaining piece',
    );
    assert.deepEqual(
        store.pieceTree(scene).parts.map((p) => p.piece.id),
        [newest],
    );
    const moonTree = store.pieceTree(newest).parts[0].piece;
    assert.equal(moonTree.id, moon);
    assert.deepEqual(moonTree.parts, [], 'the part chain stops when it reaches Earth again');
    for (const [id, source] of [
        [videoA, oldSource],
        [videoB, newSource],
    ]) {
        for (const row of [store.artifact(tree.id, id), store.libraryCuts(id)]) {
            const video = readSaved(row.source);
            assert.ok(playable(video.cuts[0]));
            assert.equal(video.pieces, source, 'playback still uses the original set-piece module');
        }
    }
    const snapshot = () =>
        ['pieces', 'piece_versions', 'piece_videos'].map((table) =>
            store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        );
    // If startup folds again, this newly saved piece would disappear or replace the keeper.
    store.savePiece(entry('Earth', null));
    const before = snapshot();
    store.close();

    store = new Store(path);
    assert.equal(store.backupPath, undefined, 'a second start makes no backup');
    assert.deepEqual(snapshot(), before, 'a second start changes nothing');
});
