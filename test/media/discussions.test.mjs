import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramReply, tutorSystem } from '../../server/media/diagrams.mjs';
import { discussion, discussionBlock } from '../fixtures/discussion.mjs';

test('discussion blocks stay hidden at every stream boundary and keep their reply position', () => {
  for (const block of [
    discussionBlock(),
    discussionBlock().replaceAll('```', '~~~~').replaceAll('\n', '\r\n'),
    '<rabbithole-discussion>' + JSON.stringify(discussion) + '</rabbithole-discussion>',
  ]) {
    for (let i = 0; i <= block.length; i++)
      assert.equal(diagramReply('Before.' + block.slice(0, i)).text.trimEnd(), 'Before.');
    const parsed = diagramReply('Before.' + block + '\nAfter.', true);
    assert.equal(parsed.text.replaceAll('\r\n', '\n'), 'Before.\nAfter.');
    assert.equal(parsed.requests[0].kind, 'discussion');
    assert.equal(parsed.requests[0].position, 7);
    assert.deepEqual(parsed.requests[0].task, discussion);
  }
});

test('discussion validation rejects malformed rosters, speakers and openings in place', () => {
  const invalid = [
    null,
    {},
    { ...discussion, classmates: discussion.classmates.slice(0, 2) },
    { ...discussion, classmates: [...discussion.classmates, ...discussion.classmates] },
    { ...discussion, classmates: discussion.classmates.map((c) => ({ ...c, level: 'near' })) },
    { ...discussion, classmates: discussion.classmates.map((c) => ({ ...c, level: 1 })) },
    { ...discussion, classmates: discussion.classmates.map((c) => ({ ...c, name: 'Maya' })) },
    { ...discussion, classmates: discussion.classmates.map((c) => ({ ...c, name: 'Tutor' })) },
    { ...discussion, classmates: discussion.classmates.map(({ voice, ...c }) => c) },
    { ...discussion, classmates: discussion.classmates.map((c) => ({ ...c, voice: ' ' })) },
    { ...discussion, classmates: discussion.classmates.map((c) => ({ ...c, voice: 'Same.' })) },
    { ...discussion, lines: discussion.lines.slice(0, 2) },
    { ...discussion, lines: [...discussion.lines, ...discussion.lines, ...discussion.lines] },
    { ...discussion, lines: discussion.lines.map((l) => ({ ...l, speaker: 'Learner' })) },
    { ...discussion, lines: discussion.lines.map((l) => ({ ...l, text: '' })) },
    { ...discussion, lines: discussion.lines.map((l) => ({ ...l, text: 'x'.repeat(2001) })) },
    { ...discussion, lines: discussion.lines.map((l) => ({ ...l, text: 'No question.' })) },
  ];
  for (const value of invalid) {
    const parsed = diagramReply('Before.' + discussionBlock(value) + '\nAfter.', true);
    assert.equal(parsed.text, 'Before.\nAfter.');
    assert.match(parsed.requests[0].error, /Discussion request could not be read/);
    assert.equal(parsed.requests[0].position, 7);
  }
  for (const block of ['\n```rabbithole-discussion\n{', discussionBlock().slice(0, -4)]) {
    const parsed = diagramReply('Before.' + block, true);
    assert.equal(parsed.text, 'Before.');
    assert.ok(parsed.requests[0].error);
  }
  const four = {
    ...discussion,
    classmates: [...discussion.classmates, { name: 'Ana', level: 'near', voice: 'Shy, careful.' }],
  };
  assert.deepEqual(diagramReply(discussionBlock(four), true).requests[0].task, four);
  const problem = (value) => diagramReply(discussionBlock(value), true).requests[0].error;
  assert.match(
    problem({ ...discussion, classmates: discussion.classmates.map(({ voice, ...c }) => c) }),
    /each classmate needs a voice/,
  );
  assert.match(
    problem({
      ...discussion,
      classmates: discussion.classmates.map((c, i) => ({ ...c, voice: i ? 'same' : 'Same' })),
    }),
    /voices must be distinct/,
  );
});

test('fixed discussion instructions require a learner request and a brief opening around familiarity', () => {
  const instructions = tutorSystem({ tutorStyle: 'Be concise.' });
  assert.match(instructions, /only when the learner (?:explicitly )?asks for a discussion/i);
  assert.match(instructions, /rabbithole-discussion/);
  assert.match(instructions, /below.*above/s);
  assert.match(instructions, /4.*8.*lines/s);
  assert.match(instructions, /ends? with a question.*learner/s);
  assert.match(instructions, /"voice"/);
  assert.match(
    instructions,
    /private voice.*how they talk and how they think.*fitting their level/s,
  );
  assert.match(instructions, /slang.*contractions.*swear word or typo.*rarely an emoji/s);
  assert.match(instructions, /learner's language/);
  assert.match(instructions, /Tutor.*plain clear lines/s);
  assert.match(instructions, /honest misunderstandings/);
  assert.match(instructions, /never flattens these voices/);
});

test('discussion slots coexist with hidden verdicts and other media in reply order', () => {
  const visual = {
    title: 'Trade',
    description: 'Plant and fungus exchange nutrients.',
    intent: 'Show the trade.',
    excerpt: 'Phosphorus for sugar.',
  };
  const parsed = diagramReply(
    'Before.' +
      '\n```rabbithole-verdict\n[{"concept":"Trade","level":1,"confidence":"low"}]\n```' +
      discussionBlock() +
      '\nBetween.' +
      '\n```rabbithole-visual\n' +
      JSON.stringify(visual) +
      '\n```' +
      '\nAfter.',
    true,
  );
  assert.equal(parsed.text, 'Before.\nBetween.\nAfter.');
  assert.deepEqual(
    parsed.requests.map((r) => [r.kind, r.position, r.task]),
    [
      ['discussion', 7, discussion],
      ['visual', 16, visual],
    ],
  );
  assert.deepEqual(parsed.verdicts, [{ concept: 'Trade', level: 1, confidence: 'low' }]);
});
