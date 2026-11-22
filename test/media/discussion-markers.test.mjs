import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDiscussionMarker, stripMarkers } from '../../server/media/markers.mjs';
import { tutorSystem } from '../../server/media/tutor-instructions.mjs';
import { APP_TOOLS } from '../../server/http/app-calls.mjs';
import { complete, open } from '../support/visual-kit.mjs';
import { discussion, publicDiscussion } from '../fixtures/discussion.mjs';

const marker = ({ classmates, lines } = discussion) =>
    `[[discussion: ${[
        ...classmates.map((c) => `${c.name} (${c.level}): ${c.voice}`),
        ...lines.map((l) => `${l.speaker} > ${l.text}`),
    ].join(' | ')}]]`;
const events = async (response) =>
    (await response.text())
        .split('\n\n')
        .filter((f) => f.startsWith('data: '))
        .map((f) => JSON.parse(f.slice(6)));
const stream = (emit, text) => {
    for (let i = 0; i < text.length; i += 7)
        emit({ type: 'delta', item: 'answer', text: text.slice(i, i + 7) });
    emit({ type: 'status', status: 'completed' });
};
const unused = { generate: async (tree, text, emit) => complete(emit, '') };

test('a discussion marker reads its classmates and lines, repairing what it can', () => {
    assert.deepEqual(readDiscussionMarker(marker().slice(14, -2)), { task: discussion });
    const line = (i) => ({ speaker: i % 2 ? 'Tutor' : 'Maya', text: `Line ${i}` });
    const many = Array.from({ length: 10 }, (_, i) => line(i));
    // An unknown speaker is dropped, lines past eight are cut, and a last line need not be a question.
    const { task } = readDiscussionMarker(
        marker({
            classmates: discussion.classmates,
            lines: [{ speaker: 'Zed', text: 'Who?' }, ...many],
        }).slice(14, -2),
    );
    assert.deepEqual(task.lines, many.slice(0, 8));
    assert.deepEqual(
        readDiscussionMarker(
            marker({ classmates: discussion.classmates.slice(0, 2), lines: many }).slice(14, -2),
        ),
        { cause: 'fewer than three classmates' },
    );
    assert.deepEqual(
        readDiscussionMarker(
            marker({ classmates: discussion.classmates, lines: many.slice(0, 3) }).slice(14, -2),
        ),
        { cause: 'fewer than four lines' },
    );
});

test('text after a closed discussion marker is dropped but its end section is read', () => {
    const { text, markers } = stripMarkers(
        `Let us talk.\n${marker()}\nMore [[term]] text.\n[[next: Why fungi?]]\n[[end]]`,
        true,
    );
    assert.equal(text, 'Let us talk.\n');
    assert.deepEqual(
        markers.map((m) => [m.kind, m.position]),
        [
            ['discussion', 13],
            ['next', 13],
            ['end', 13],
        ],
    );
});

test('the tool-path prompt describes the discussion marker and never start_discussion', () => {
    for (const prompt of [
        tutorSystem({ tools: APP_TOOLS }),
        tutorSystem({ textTools: APP_TOOLS }),
    ]) {
        assert.match(
            prompt,
            /\[\[discussion: Name \(level\): voice \| … \| Speaker > line \| …\]\]/,
        );
        assert.doesNotMatch(prompt, /start_discussion|started/);
    }
});

test('a discussion marker starts the discussion and ends the reply; later text never appears', async () => {
    let offered;
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                offered = tree.tools.map((t) => t.name);
                stream(
                    emit,
                    `Let us talk.\n${marker()}\nSECRET trailing text.\n[[next: Why do fungi trade?]]\n[[end]]`,
                );
            },
        },
        unused,
    );
    try {
        const streamed = await events(
            await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Discuss it.' }),
        );
        assert.deepEqual(streamed.at(-1), { type: 'done', status: 'completed' });
        assert.ok(!offered.includes('start_discussion'));
        for (const e of streamed.filter((e) => e.type === 'text'))
            assert.doesNotMatch(e.text, /SECRET|discussion|\[|sceptical/);
        assert.ok(streamed.some((e) => e.type === 'questions'));
        const saved = await env.get(`/api/trees/${env.tree.id}`);
        assert.equal(saved.messages.at(-1).text, 'Let us talk.\n');
        const [ready, ...rest] = saved.artifacts;
        assert.equal(rest.length, 0);
        assert.equal(ready.kind, 'discussion');
        assert.equal(ready.status, 'ready');
        assert.equal(ready.position, 'Let us talk.\n'.length);
        assert.deepEqual(ready.discussion, publicDiscussion);
        assert.deepEqual(JSON.parse(env.store.tree(env.tree.id).artifacts[0].source), discussion);
    } finally {
        await env.close();
    }
});

test('a discussion marker with too few classmates or lines, or not closed by its line, starts nothing and is logged', async () => {
    const logs = [];
    const few = marker({ ...discussion, classmates: discussion.classmates.slice(0, 2) });
    const short = marker({ ...discussion, lines: discussion.lines.slice(0, 3) });
    const replies = [`A.\n${few}\n`, `B.\n${short}\n`, `C.\n${marker().slice(0, -2)}\nAfter.`];
    let i = 0;
    const env = await open(
        { generate: async (tree, text, emit) => stream(emit, replies[i++]) },
        unused,
        { log: (line) => logs.push(line) },
    );
    try {
        for (const _ of replies)
            await events(
                await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Discuss it.' }),
            );
        const saved = env.store.tree(env.tree.id);
        assert.deepEqual(
            saved.messages.filter((m) => m.role === 'assistant').map((m) => m.text),
            ['A.\n', 'B.\n', 'C.\n\nAfter.'],
        );
        assert.equal(saved.artifacts.length, 0);
        const drops = logs.filter((l) => /discussion marker dropped/.test(l));
        assert.deepEqual(
            drops.map((l) => /cause="([^"]+)"/.exec(l)[1]),
            [
                'fewer than three classmates',
                'fewer than four lines',
                'not closed by the end of its line',
            ],
        );
        assert.ok(!logs.some((l) => /sceptical/.test(l)));
    } finally {
        await env.close();
    }
});
