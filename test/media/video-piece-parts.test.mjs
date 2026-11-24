import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    planFor,
    composition,
    directive,
    complete,
    until,
    open,
    fakeRender,
    planText,
    fixerTask,
    patchOf,
} from '../support/video-kit.mjs';
import { writeSetPieces, withParts } from '../../server/media/video-pieces.mjs';
import { PIECES_PARTS_NOTE } from '../../server/media/video-cut.mjs';

test('the writer asks for parts; the library is searched for them; the own part of the video wins and parts are saved as their own entries', async (t) => {
    const looks = { city: 'small town', stadium: 'round stadium', person: 'stick person' };
    const plan = planFor(composition, 1);
    plan.styleBrief = {
        ...plan.styleBrief,
        paletteRoles: { city: 'leaf', stadium: 'rust' },
        recurringObjects: [
            { name: 'city', position: 'left', colorRole: 'city', look: looks.city },
            { name: 'stadium', position: 'right', colorRole: 'stadium', look: looks.stadium },
        ],
    };
    const vectors = { [looks.city]: [0, 1], [looks.stadium]: [0.6, 0.8], [looks.person]: [1, 0] };
    const person = (width) =>
        `import { palette } from './kit';\nexport function Person({ x, y }) { return <div style={{ left: x, top: y, width: ${width}, background: palette.paper }} />; }`;
    const written = `${person(22)}
export function Stadium({ x, y }) { return <div style={{ left: x, top: y, background: colors.stadium }}><Person x={x} y={y} /><Person x={x + 30} y={y} /></div>; }`.replace(
        'import { palette }',
        'import { colors, palette }',
    );
    const inputs = [],
        rules = [];
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.id) return complete(emit, 'Watch.' + directive);
                if (tree.stage === 'plan') return complete(emit, planText(plan));
                if (tree.stage === 'pieces') {
                    inputs.push(JSON.parse(text));
                    rules.push(tree.instructions);
                    if (inputs.length === 1)
                        return complete(
                            emit,
                            JSON.stringify({ parts: [{ name: 'Person', look: looks.person }] }),
                        );
                    const id = (n) =>
                        inputs[1].library.flatMap((l) => l.matches).find((m) => m.name === n).id;
                    return complete(
                        emit,
                        JSON.stringify({
                            pieces: [
                                { name: 'City', use: 'reuse', reason: 'fits', id: id('Town') },
                                { name: 'Stadium', use: 'new', reason: 'fits' },
                                { name: 'Person', use: 'new', reason: 'fits' },
                            ],
                            code: written,
                        }),
                    );
                }
                complete(emit, composition);
            },
        },
        { videoEmbed: async (texts) => texts.map((t) => vectors[t]), videoRender: fakeRender },
    );
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    const libraryPerson = env.store.savePiece(
        {
            name: 'Person',
            look: 'stick figure',
            props: ['x', 'y'],
            source: person(11),
            roles: [],
            embedding: [1, 0.1],
        },
        'old-video',
    );
    const town = env.store.savePiece(
        {
            name: 'Town',
            look: 'small town',
            props: ['x', 'y'],
            source: `import { colors } from './kit';\nexport function Town({ x, y }) { return <div style={{ left: x, top: y, background: colors.town }}><Person x={x} y={y} /></div>; }`,
            roles: ['town'],
            parts: [{ name: 'Person', id: libraryPerson }],
            embedding: [0, 1],
        },
        'old-video',
    );
    const chat = env.store.create('Parts', 'codex');
    await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
    const row = await until(() =>
        env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
    );
    assert.equal(row.status, 'ready', row.error);
    assert.ok(rules[0].includes(PIECES_PARTS_NOTE));
    assert.equal(inputs[0].parts, undefined);
    assert.deepEqual(inputs[1].parts, [{ name: 'Person', look: looks.person }]);
    assert.deepEqual(
        inputs[1].library.map((l) => [l.name, l.matches[0].name]),
        [
            ['City', 'Town'],
            ['Stadium', 'Town'],
            ['Person', 'Person'],
        ],
        'the library lookup runs for the candidate part too',
    );
    assert.deepEqual(inputs[1].library[0].matches[0].parts, ['Person'], 'matches name their parts');

    const module = JSON.parse(row.source).pieces;
    assert.equal(
        (module.match(/function Person\(/g) ?? []).length,
        1,
        "the video's own Person wins",
    );
    assert.match(module, /width: 22/);
    assert.doesNotMatch(module, /width: 11/, 'the library part of the same name stays out');
    assert.match(module, /colors\.city/, 'the reused piece takes the new roles');

    const fresh = env.store.db
        .prepare('SELECT id FROM pieces WHERE id NOT IN (?,?) ORDER BY rowid')
        .all(libraryPerson, town)
        .map((r) => env.store.piece(r.id));
    const [savedPerson, stadium] = ['Person', 'Stadium'].map((n) =>
        fresh.find((p) => p.name === n),
    );
    assert.equal(
        fresh.length,
        2,
        'the new piece and the new part are saved; the reused one is not',
    );
    assert.equal(savedPerson.look, looks.person, 'a part is a library piece of its own');
    assert.deepEqual(stadium.parts, [{ name: 'Person', id: savedPerson.id }]);
    assert.doesNotMatch(stadium.source, /function Person/, 'a piece refers to its parts');
    assert.deepEqual(env.store.piece(town).videos, ['old-video', row.id]);

    // An improved part reaches later assemblies of the pieces using it; the saved video keeps its module.
    env.store.improvePiece(savedPerson.id, { source: person(33), props: ['x', 'y'], roles: [] });
    assert.equal(
        JSON.parse(env.store.tree(chat.id).artifacts.find((a) => a.id === row.id).source).pieces,
        module,
    );
    const later = withParts(env.store.pieceTree(stadium.id));
    assert.match(later.source, /width: 33/);
    assert.match(later.source, /export const Person = \(\(\) => \{/);
});

test('a reused piece brings its parts in both forms, scoped and role-remapped; a bad parts request is retried', async () => {
    const person = {
        id: 'p',
        name: 'Person',
        look: 'stick person',
        props: ['x', 'y'],
        roles: ['crowd'],
        source: `import { colors } from './kit';\nexport function Person({ x }) { return <div style={{ left: x, background: colors.crowd }} />; }`,
        source3d: `import { colors } from './kit';\nexport function Person3D() { return <group><mesh><meshStandardMaterial color={colors.crowd} /></mesh></group>; }`,
        parts: [],
    };
    const town = {
        id: 't',
        name: 'Town',
        look: 'small town',
        props: ['x', 'y'],
        roles: ['town'],
        source: `import { colors } from './kit';\nexport function Town({ x }) { return <div style={{ left: x, background: colors.town }}><Person x={x} /></div>; }`,
        source3d: `import { colors } from './kit';\nexport function Town3D() { return <group><Person3D /><mesh><meshStandardMaterial color={colors.town} /></mesh></group>; }`,
        parts: [{ name: 'Person', id: 'p', piece: person }],
    };
    const plan = planFor(composition, 1);
    plan.cuts[0].dimension = '3d';
    plan.styleBrief = {
        ...plan.styleBrief,
        paletteRoles: { city: 'leaf' },
        recurringObjects: [
            { name: 'city', position: 'centre', colorRole: 'city', look: 'small town' },
        ],
    };
    const answers = [
        { parts: [{ name: 'City', look: 'clash' }] },
        { pieces: [{ name: 'City', use: 'reuse', reason: 'fits', id: 't' }], code: '' },
    ];
    const inputs = [];
    const { source, parts } = await writeSetPieces({
        plan,
        names: ['City'],
        matches: async () => [[town]],
        signal: new AbortController().signal,
        // The retry patches the code of the first answer; its piece choices stay.
        write: async (_rules, text) => {
            inputs.push(fixerTask(text));
            const answer = answers[inputs.length - 1];
            return inputs.at(-1).failedCode === undefined
                ? JSON.stringify(answer)
                : patchOf(inputs.at(-1).failedCode, answer.code);
        },
    });
    assert.match(inputs[1].validationError, /new PascalCase name/);
    assert.deepEqual(parts, []);
    assert.match(
        source,
        /export const City = \(\(\) => \{[\s\S]*const Person = \(\(\) => \{[\s\S]*return Town;/,
    );
    assert.match(
        source,
        /export const City3D = \(\(\) => \{[\s\S]*const Person3D = \(\(\) => \{[\s\S]*return Town3D;/,
    );
    assert.doesNotMatch(source, /colors\.(?:crowd|town)/, 'parts take the new roles too');
    assert.deepEqual(withParts(town).roles, ['town', 'crowd']);
    assert.equal(withParts(person).source, person.source, 'a piece without parts is unchanged');
});
