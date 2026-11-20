import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAI } from '../../server/providers/openai.mjs';
import { videoCall } from '../../server/media/video-call.mjs';
import { fakeOpenAI, streamReply, streamToolCalls } from '../support/fake-openai.mjs';

const FINISH = { name: 'finish_video', description: 'Finish.', parameters: { type: 'object' } };

// The model sends finish_video, then stops with no text, as the plan instructions ask.
async function silentAfterTool(t) {
    const fake = await fakeOpenAI(t);
    let round = 0;
    fake.reply = (req, res) =>
        round++ === 0
            ? streamToolCalls(res, [{ name: 'finish_video', input: {} }])
            : streamReply(res, []);
    const dir = mkdtempSync(join(tmpdir(), 'tt-tool-only-'));
    writeFileSync(
        join(dir, 'openai-endpoints.json'),
        JSON.stringify([
            { id: 'openai', name: 'Fake', baseUrl: fake.baseUrl, apiKey: 'tool-only-secret' },
        ]),
        { mode: 0o600 },
    );
    return new OpenAI(dir);
}

test('a video call that reports through tools may end with no text', async (t) => {
    const endpoint = await silentAfterTool(t),
        ran = [];
    const answer = await videoCall(
        endpoint,
        { model: 'local-tutor' },
        'Plan through tools.',
        '{}',
        new AbortController().signal,
        undefined,
        undefined,
        undefined,
        { tools: [FINISH], runTool: (name) => (ran.push(name), 'Video plan finished.') },
    );
    assert.equal(answer, '');
    assert.deepEqual(ran, ['finish_video']);
});

test('a tutor turn that ends with no text after a tool still fails', async (t) => {
    const endpoint = await silentAfterTool(t);
    await assert.rejects(
        endpoint.generate(
            { model: 'local-tutor', tools: [FINISH], runTool: () => 'ok' },
            'Hi',
            () => {},
            () => {},
            new AbortController().signal,
        ),
        /ended without a complete text reply/,
    );
});
