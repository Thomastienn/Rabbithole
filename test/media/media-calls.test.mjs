import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { videoResponse, complete, until, open } from '../support/video-kit.mjs';
import { discussion, publicDiscussion } from '../fixtures/discussion.mjs';
import { readMakeVideo, videoContext } from '../../server/tools/makeVideo.mjs';
import { readStartDiscussion } from '../../server/tools/startDiscussion.mjs';
import { tutorSystem } from '../../server/media/diagrams.mjs';
import { APP_TOOLS } from '../../server/http/app-calls.mjs';

test('make_video and start_discussion name a bad argument; their rules live in the tool descriptions', () => {
  assert.throws(() => readMakeVideo({}), /make_video needs topic/);
  assert.throws(() => readMakeVideo({ topic: 'x'.repeat(201) }), /topic is 201 characters/);
  assert.equal(readMakeVideo({ topic: ' Orbits ' }), 'Orbits');
  assert.throws(
    () => readStartDiscussion({ classmates: [] }),
    /^Error: start_discussion: choose 3/,
  );
  assert.deepEqual(readStartDiscussion(discussion), discussion);
  assert.equal(
    videoContext(
      [
        { role: 'user', text: 'Hi' },
        { role: 'assistant', text: 'Hello.' },
      ],
      'Video?',
      ' Sure. ',
    ),
    'Learner: Hi\n\nTutor: Hello.\n\nLearner: Video?\n\nTutor: Sure.',
  );
  for (const prompt of [tutorSystem({ tools: APP_TOOLS }), tutorSystem({ textTools: APP_TOOLS })]) {
    assert.doesNotMatch(
      prompt,
      /rabbithole-(video|discussion)|Discussion: create one|video request stands alone/,
    );
    assert.match(prompt, /make_video/);
  }
  // The legacy prompt still carries the block rules.
  assert.match(tutorSystem({}), /rabbithole-video block/);
});

// The tutor's calls go over the per-turn MCP server, the way Claude and Codex make them.
async function callAll(tree, emit, signal, calls) {
  const turn = await tree.mcp.open(tree, emit, signal);
  const client = new Client({ name: 'fixture', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(turn.url), {
      requestInit: { headers: turn.headers },
    }),
  );
  const results = [];
  for (const [name, args] of calls)
    results.push((await client.callTool({ name, arguments: args })).content[0].text);
  await client.close();
  turn.close();
  return results;
}

const visual = { title: 'Orbit', shows: 'Earth circling the Sun', alt: 'Earth circles the Sun.' };

test('make_video plans from the conversation; other media beside it gets a plain error', async () => {
  const plans = [],
    logs = [];
  let calls, results;
  const env = await open(
    {
      generate: async (tree, text, emit, _save, signal) => {
        if (!tree.id) {
          if (tree.instructions.startsWith('You plan')) plans.push(JSON.parse(text));
          return complete(emit, videoResponse(tree));
        }
        emit({ type: 'item', item: 'a', text: 'Sure.' });
        results = await callAll(tree, emit, signal, calls);
        complete(emit, 'On its way.');
      },
    },
    { log: (line) => logs.push(line) },
  );
  try {
    const tree = env.store.create('Orbits', 'codex');
    calls = [
      ['make_video', { topic: '' }],
      ['make_video', { topic: 'How Earth orbits the Sun' }],
      ['show_visual', visual],
      ['make_video', { topic: 'Again' }],
    ];
    const ask = 'Make a video of how Earth orbits the Sun.';
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: ask })).text();
    assert.match(results[0], /make_video needs topic/);
    assert.equal(results[1], 'queued');
    assert.match(results[2], /show_visual cannot join a video/);
    assert.match(results[3], /make_video cannot join a video/);
    const [video, ...rest] = env.store.tree(tree.id).artifacts;
    assert.equal(rest.length, 0);
    assert.equal(video.kind, 'video');
    assert.equal(video.position, 'Sure.'.length);
    await until(() => plans.length === 1);
    assert.equal(plans[0].request, ask);
    assert.equal(plans[0].intent, 'How Earth orbits the Sun');
    assert.equal(plans[0].context, `Learner: ${ask}\n\nTutor: Sure.`);

    // Each refusal is a warn line with tool, reply id and reason, never the input values.
    const reply = env.store.tree(tree.id).messages.at(-1).id;
    const refusals = logs.filter((l) => / WARN chat app tool call refused /.test(l));
    assert.equal(refusals.length, 3);
    assert.match(
      refusals[0],
      new RegExp(`id="${reply}" tool="make_video" cause="make_video needs topic`),
    );
    assert.match(refusals[1], /tool="show_visual" cause="show_visual cannot join a video/);
    assert.ok(!refusals.some((l) => /Orbit|Again|Earth circl/.test(l)));

    // A visual first: the video is refused, and so is a record_turn video offer beside it.
    calls = [
      ['show_visual', visual],
      ['make_video', { topic: 'Orbits' }],
      ['record_turn', { video_offer: 'Can you make a video of an orbit?' }],
    ];
    const other = env.store.create('Mixed', 'codex');
    await (await env.post(`/api/trees/${other.id}/messages`, { text: ask })).text();
    assert.equal(results[0], 'queued');
    assert.match(results[1], /make_video stands alone/);
    assert.match(results[2], /skipped video_offer \(never in a reply holding/);
    // The tutor judges the ask: no trigger words and other languages start a video too.
    for (const text of [
      'can u quicky a short video how to play, just 2d video',
      'Peux-tu me montrer comment la Terre tourne autour du Soleil ?',
    ]) {
      calls = [['make_video', { topic: 'How to play' }]];
      const asked = env.store.create('Asked', 'codex');
      await (await env.post(`/api/trees/${asked.id}/messages`, { text })).text();
      assert.equal(results[0], 'queued');
      assert.equal(env.store.tree(asked.id).artifacts[0].kind, 'video');
    }
  } finally {
    await env.close();
  }
});

test('start_discussion opens a discussion at its position with private levels and voices', async () => {
  let results;
  const env = await open({
    generate: async (tree, text, emit, _save, signal) => {
      emit({ type: 'item', item: 'a', text: 'Let us talk.' });
      results = await callAll(tree, emit, signal, [
        ['start_discussion', { ...discussion, lines: discussion.lines.slice(0, 2) }],
        ['start_discussion', discussion],
      ]);
      emit({ type: 'status', status: 'completed' });
    },
  });
  try {
    const tree = env.store.create('Fungi', 'codex');
    const stream = await (
      await env.post(`/api/trees/${tree.id}/messages`, { text: 'Discuss this with classmates.' })
    ).text();
    assert.match(results[0], /start_discussion: the opening needs 4 to 8 lines/);
    assert.match(results[1], /^started/);
    assert.doesNotMatch(stream, /"level"|"voice"|sceptical/);
    const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
    const [ready] = saved.artifacts;
    assert.equal(saved.artifacts.length, 1);
    assert.equal(ready.kind, 'discussion');
    assert.equal(ready.status, 'ready');
    assert.equal(ready.position, 'Let us talk.'.length);
    assert.deepEqual(ready.discussion, publicDiscussion);
    assert.deepEqual(JSON.parse(env.store.tree(tree.id).artifacts[0].source), discussion);
    assert.equal(saved.messages.at(-1).text, 'Let us talk.');
  } finally {
    await env.close();
  }
});
