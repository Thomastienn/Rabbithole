import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDiagram } from '../../server/media/diagrams.mjs';
import { parseDiagram } from '../../server/media/mermaid-parse.mjs';

const invalidSyntax = ['not Mermaid at all', 'flowchart TD\n A[unfinished'];

test('plain flowchart, sequence, class, state, ER and pie definitions pass the real parser; invalid syntax fails it', async () => {
  const valid = [
    'graph LR\n A --> B',
    'sequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Hi',
    'classDiagram\n Animal <|-- Duck\n Animal : +int age',
    'stateDiagram-v2\n [*] --> Learning\n Learning --> [*]',
    'erDiagram\n TEACHER ||--o{ LESSON : teaches',
    'pie\n "First round" : 4\n "Final" : 2',
  ];
  for (const value of valid) assert.equal(await parseDiagram(value), true, value);
  for (const value of invalidSyntax) assert.equal(await parseDiagram(value), false, value);
  // The production worker path uses the same parser and propagates acceptance/rejection.
  const check = (value) =>
    generateDiagram(
      {
        generate: async (_tree, _text, emit) => {
          emit({ type: 'item', item: 'answer', text: value });
          emit({ type: 'status', status: 'completed' });
        },
      },
      { provider: 'codex', model: 'fixture-model' },
      {},
      new AbortController().signal,
    );
  assert.equal(await check(valid[0]), valid[0]);
  await assert.rejects(check(invalidSyntax[0]), /Invalid Mermaid syntax/);
});
