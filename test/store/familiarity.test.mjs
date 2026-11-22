import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../../server/store.mjs';
import { familiarity, PRIOR, FLOOR, START_STABILITY, GAP } from '../../server/familiarity.mjs';

const DAY = 24 * 60 * 60 * 1000;
const near = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
const at = (t, level, confidence = 'low') => ({ level, confidence, at: t });

test('the prior with no observations', () => {
    assert.equal(familiarity([], 0), PRIOR);
    near(PRIOR, 0.3);
});

test('a high-confidence observation moves further than a low-confidence one', () => {
    // Prior weight 1: low weight 1 steps halfway, high weight 2 steps two thirds.
    near(familiarity([at(0, 5, 'low')], 0), 0.3 + 0.5 * 0.7);
    near(familiarity([at(0, 5, 'high')], 0), 0.3 + (2 / 3) * 0.7);
});

test('a misconception pulls a well-known concept down', () => {
    const known = Array.from({ length: 6 }, (_, i) => at(i, 5, 'high'));
    const before = familiarity(known, 5);
    assert.ok(before > 0.95);
    const after = familiarity([...known, at(5, 0, 'high')], 5);
    assert.ok(after < before - 0.2, `${after} well below ${before}`);
});

test('fading drifts toward 0.2 and never below it by fading alone', () => {
    const one = [at(0, 5, 'high')];
    const start = familiarity(one, 0);
    near(familiarity(one, START_STABILITY), FLOOR + (start - FLOOR) / Math.E);
    near(familiarity(one, 1000 * DAY), FLOOR);
    assert.ok(familiarity(one, 1e15) >= FLOOR);
    // From below the floor (a misconception), fading drifts up toward it, not past it.
    const wrong = familiarity([at(0, 0, 'high')], 1000 * DAY);
    near(wrong, FLOOR);
});

test('stability grows only across gaps, so fading slows', () => {
    const close = [at(0, 4, 'high'), at(GAP / 10, 4, 'high')];
    const spaced = [at(0, 4, 'high'), at(GAP, 4, 'high')];
    const later = (list) => familiarity(list, list[1].at + 3 * DAY);
    const fresh = (list) => familiarity(list, list[1].at);
    // Spaced evidence fades a smaller share of its distance from the floor over the same time.
    const kept = (list) => (later(list) - FLOOR) / (fresh(list) - FLOOR);
    near(kept(close), Math.exp(-3 / 2));
    near(kept(spaced), Math.exp(-3 / 6));
    // Low levels after a gap do not grow stability.
    const low = [at(0, 1), at(GAP, 1)];
    near(kept(low), Math.exp(-3 / 2));
});

test('a misconception resets stability', () => {
    const spaced = [at(0, 4, 'high'), at(GAP, 4, 'high'), at(2 * GAP, 4, 'high')];
    const reset = [...spaced, at(2 * GAP + 1, 0, 'low'), at(2 * GAP + 2, 4, 'high')];
    const kept = (list) => {
        const t = list.at(-1).at;
        return (familiarity(list, t + 3 * DAY) - FLOOR) / (familiarity(list, t) - FLOOR);
    };
    near(kept(spaced), Math.exp(-3 / 18));
    near(kept(reset), Math.exp(-3 / 2));
});

test('met evidence has no effect; observations replace per message and unknown names become concepts', () => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-familiar-')), 'trees.sqlite'));
    const tree = store.create().id;
    const graph = (names, message) =>
        store.addGraph(
            { concepts: names.map((name) => ({ name, topics: ['T'] })), links: [] },
            message,
        );
    for (let i = 0; i < 50; i++) graph(['Met'], `m${i}`);
    const of = (name) => store.graph().concepts.find((c) => c.name === name);
    assert.deepEqual(of('Met'), {
        name: 'Met',
        topics: ['T'],
        familiarity: 0.3,
        met: 50,
        observations: [0, 0, 0, 0, 0, 0],
    });
    const ask = store.message(tree, 'user', 'q', 'completed');
    store.observe(ask, [
        { concept: 'met', level: 3, confidence: 'high' },
        { concept: 'Brand new', level: 1, confidence: 'low' },
    ]);
    assert.deepEqual(of('Met').observations, [0, 0, 0, 1, 0, 0]);
    assert.equal(of('Met').familiarity, 0.5);
    assert.deepEqual(of('Brand new'), {
        name: 'Brand new',
        topics: [],
        familiarity: 0.25,
        met: 0,
        observations: [0, 1, 0, 0, 0, 0],
    });
    // A retried reply's verdict replaces the message's observations.
    store.observe(ask, [{ concept: 'Met', level: 0, confidence: 'low' }]);
    assert.deepEqual(of('Met').observations, [1, 0, 0, 0, 0, 0]);
    assert.deepEqual(of('Brand new').observations, [0, 0, 0, 0, 0, 0]);
    // Merging moves observations to the kept concept.
    store.observe(store.message(tree, 'user', 'q2', 'completed'), [
        { concept: 'Brand new', level: 5, confidence: 'high' },
    ]);
    store.mergeConcepts('Met', 'Brand new');
    assert.deepEqual(of('Brand new').observations, [1, 0, 0, 0, 0, 1]);
    // The graph runs the same number of queries however many concepts it holds.
    const queries = () => {
        const prepare = store.db.prepare;
        let n = 0;
        store.db.prepare = (...args) => (n++, prepare.apply(store.db, args));
        store.graph();
        store.db.prepare = prepare;
        return n;
    };
    const few = queries();
    graph(
        Array.from({ length: 20 }, (_, i) => `Extra ${i}`),
        'm-extra',
    );
    assert.equal(queries(), few);
});

test('the schema upgrade deletes old familiarity evidence and keeps met', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'tt-upgrade-')), 'trees.sqlite');
    new Store(path).db.close();
    const db = new DatabaseSync(path);
    db.exec(`DROP TABLE observations; INSERT INTO concepts(id,name) VALUES (1,'C');
    INSERT INTO evidence(concept,kind,source,at) VALUES (1,'met','r',0),(1,'asked','c',0),(1,'used','u',0),(1,'ignored','r',0),(1,'known',NULL,0),(1,'unknown',NULL,0);`);
    db.close();
    const store = new Store(path);
    assert.deepEqual(
        store.db
            .prepare('SELECT kind FROM evidence')
            .all()
            .map((r) => r.kind),
        ['met'],
    );
    // Once only: later met rows and opens keep everything.
    store.db.close();
    assert.equal(new Store(path).graph().concepts[0].met, 1);
});

test('a brief explanation (level 2, low confidence) lifts an unknown concept and dips a well-known one', () => {
    near(familiarity([at(0, 2)], 0), 0.35);
    const known = [at(0, 5, 'high'), at(0, 5, 'high'), at(0, 5, 'high')];
    near(familiarity(known, 0), 0.9);
    const after = familiarity([...known, at(0, 2)], 0);
    assert.ok(Math.abs(after - 0.83) < 0.005, `${after} about 0.83`);
});
