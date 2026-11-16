import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { planFor, composition, directive, complete, until, open } from '../support/video-kit.mjs';
import { AUDIT_INSTRUCTIONS, PIECE_IMPROVE_INSTRUCTIONS } from '../../server/media/video-cut.mjs';
import { poorPieces } from '../../server/media/video-cuts.mjs';
import { REMOTION_SKILL } from '../../server/media/skills.mjs';

const look = 'A rounded box 240x120 px with a crown on top';
const pieces = `import { colors, palette } from './kit';
export function Winner({ x, y, scale = 1, highlight = false }) {
  return <div style={{ position: 'absolute', left: x, top: y, background: highlight ? colors.winner : palette.raised }}>Winner</div>;
}`;
const better = pieces.replace('>Winner<', '>Crowned winner<');
const usesPieces = composition.replace(
  'import { AbsoluteFill',
  "import { Winner } from './pieces';\nimport { AbsoluteFill",
);
const snapshot = async (dir, list) => {
  for (const { file } of list) writeFileSync(file, 'jpeg');
};

async function run(t, rewrite) {
  const plan = planFor(usesPieces, 1);
  plan.styleBrief = {
    ...plan.styleBrief,
    recurringObjects: [{ ...plan.styleBrief.recurringObjects[0], look }],
  };
  const calls = { audit: [], improve: [] };
  const logs = [];
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        if (tree.instructions.startsWith('You write the set pieces')) return complete(emit, pieces);
        if (tree.instructions === AUDIT_INSTRUCTIONS) {
          calls.audit.push(JSON.parse(text));
          return complete(
            emit,
            JSON.stringify({ ok: true, pieces: [{ name: 'Winner', why: 'No crown on top' }] }),
          );
        }
        if (tree.instructions.startsWith(PIECE_IMPROVE_INSTRUCTIONS)) {
          assert.ok(tree.instructions.includes(REMOTION_SKILL));
          calls.improve.push(JSON.parse(text));
          return complete(emit, rewrite);
        }
        complete(emit, usesPieces);
      },
    },
    { videoSnapshot: snapshot, log: (line) => logs.push(line) },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const chat = env.store.create('Improve', 'codex');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
  const row = await until(() =>
    env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
  );
  assert.equal(row.status, 'ready', row.error);
  const [saved] = env.store.pieceList().map((p) => env.store.piece(p.id));
  return { row, saved, calls, logs };
}

test('an audit flagging a saved piece has the smart model rewrite it; the library entry is replaced, the current video keeps its piece', async (t) => {
  const { row, saved, calls, logs } = await run(t, better);
  assert.deepEqual(calls.audit[0].libraryPieces, ['Winner'], 'the audit is offered the piece');
  assert.equal(calls.improve.length, 1);
  assert.equal(calls.improve[0].source, pieces, 'the rewrite starts from the saved source');
  assert.equal(calls.improve[0].why, 'No crown on top');
  assert.equal(saved.source, better, 'the library entry is replaced');
  assert.ok(saved.improved > saved.created, 'last-improved time moves');
  assert.equal(JSON.parse(row.source).pieces, pieces, 'the current video keeps its piece');
  assert.ok(logs.some((l) => l.includes('stage="improve"')));
});

test('an invalid piece rewrite leaves the library entry unchanged', async (t) => {
  const { row, saved, calls } = await run(t, better.replace('palette.raised', "'white'"));
  assert.equal(calls.improve.length, 1);
  assert.equal(saved.source, pieces);
  assert.equal(saved.improved, saved.created);
  assert.equal(JSON.parse(row.source).pieces, pieces);
});

test('only offered pieces with a reason are flagged', () => {
  const answer = (pieces) => JSON.stringify({ ok: true, pieces });
  assert.deepEqual(
    poorPieces(
      answer([
        { name: 'Winner', why: 'flat' },
        { name: 'Other', why: 'x' },
        { name: 'Winner', why: ' ' },
      ]),
      ['Winner'],
    ),
    [{ name: 'Winner', why: 'flat' }],
  );
  assert.deepEqual(poorPieces('{"ok":true}', ['Winner']), []);
  assert.deepEqual(poorPieces('not json', ['Winner']), []);
});
