import { test } from 'node:test';
import assert from 'node:assert/strict';
import { task, source, complete, until, open } from '../support/visual-kit.mjs';

test('visuals get no stock offers and validation rejects stock pieces with a clear problem', async () => {
  const inputs = [],
    prompts = [];
  const env = await open(
    {
      generate: async (_tree, _text, emit) =>
        complete(
          emit,
          '\n```rabbithole-visual\n' + JSON.stringify({ ...task, objects: ['horse'] }) + '\n```',
        ),
    },
    {
      generate: async (tree, text, emit) => {
        prompts.push(tree.instructions);
        inputs.push(JSON.parse(text));
        complete(
          emit,
          inputs.length === 1
            ? '<div id="v"></div><script>v.append(stockPiece("fluent-emoji:horse"))</script>'
            : source,
        );
      },
    },
  );
  try {
    await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Show rounds' })).text();
    await until(async () =>
      (await env.get(`/api/trees/${env.tree.id}`)).artifacts.every((a) => a.status === 'ready'),
    );
    assert.equal(inputs.length, 2);
    for (const input of inputs) {
      assert.equal(input.stockPieces, undefined);
      assert.equal(input.request.objects, undefined);
    }
    assert.match(inputs[1].validationError, /stock pieces are retired/);
    assert.doesNotMatch(prompts[0], /stockPiece/);
    assert.equal((await fetch(`${env.origin}/api/stock/fluent-emoji%3Ahorse`)).status, 404);
  } finally {
    await env.close();
  }
});
