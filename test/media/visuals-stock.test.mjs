import { test } from 'node:test';
import assert from 'node:assert/strict';
import { task, source, complete, until, open } from '../support/visual-kit.mjs';

test('visual objects within their limits get a top-3 stock shortlist in the model input; no objects, no shortlist', async () => {
  const inputs = [],
    matched = [],
    prompts = [];
  let objects = [' Horse ', 'x'.repeat(70), 'horse', 7, 'coin', 'tree', 'box', 'cup', 'pen'];
  const env = await open(
    {
      generate: async (_tree, _text, emit) =>
        complete(
          emit,
          '\n```rabbithole-visual\n' +
            JSON.stringify(objects ? { ...task, objects } : task) +
            '\n```',
        ),
    },
    {
      generate: async (tree, text, emit) => {
        prompts.push(tree.instructions);
        inputs.push(JSON.parse(text));
        complete(emit, source);
      },
    },
    {
      stock: {
        match: async (names) => (
          matched.push(names),
          names.map((object) => ({
            object,
            pieces:
              object === 'coin'
                ? []
                : [1, 2, 3].map((n) => ({
                    id: `fluent-emoji:${n}`,
                    title: `${object} ${n}`,
                    type: 'emoji',
                  })),
          }))
        ),
      },
    },
  );
  try {
    for (const next of [objects, undefined]) {
      objects = next;
      await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Show rounds' })).text();
      await until(async () =>
        (await env.get(`/api/trees/${env.tree.id}`)).artifacts.every((a) => a.status === 'ready'),
      );
    }
    assert.deepEqual(matched, [['Horse', 'x'.repeat(60), 'horse', 'coin', 'tree', 'box']]);
    assert.deepEqual(
      inputs[0].stockPieces.map((o) => [o.object, o.pieces.length]),
      [
        ['Horse', 3],
        ['x'.repeat(60), 3],
        ['horse', 3],
        ['tree', 3],
        ['box', 3],
      ],
    );
    assert.deepEqual(Object.keys(inputs[0].stockPieces[0].pieces[0]), ['id', 'title', 'type']);
    assert.equal(inputs[1].stockPieces, undefined);
    assert.equal(matched.length, 1, 'a visual without objects asks the catalog for nothing');
    assert.match(prompts[0], /stockPiece\(id\)[\s\S]*Use only offered IDs, or none/);
    assert.match(prompts[0], /keeps its own\s+colours[\s\S]*real colour carries no meaning/);
  } finally {
    await env.close();
  }
});

test('the stock route returns piece data for an ID and refuses an unknown ID', async () => {
  const env = await open(
    { generate: async (_tree, _text, emit) => complete(emit, 'Hi') },
    { generate: async () => {} },
    {
      stock: {
        match: async () => [],
        piece: async (id) => (id === 'fluent-emoji:horse' ? '<svg id="horse"></svg>' : null),
      },
    },
  );
  try {
    const ok = await fetch(`${env.origin}/api/stock/${encodeURIComponent('fluent-emoji:horse')}`);
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /json/);
    assert.deepEqual(await ok.json(), { svg: '<svg id="horse"></svg>' });
    const unknown = await fetch(`${env.origin}/api/stock/fluent-emoji%3Aunicorn`);
    assert.equal(unknown.status, 404);
  } finally {
    await env.close();
  }
});
