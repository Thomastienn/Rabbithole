import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Claude } from '../../server/providers/claude.mjs';

// The real Claude Code CLI: a ready runner answers without a start-up, clears between calls and switches model live.
test('Claude quick thinking runner: no start-up wait, clean context per call, live model switch', async (t) => {
    const claude = new Claude(mkdtempSync(join(tmpdir(), 'tt-runner-live-')), spawn);
    t.after(() => claude.close());
    const call = async (text, model) => {
        const items = new Map(),
            events = [],
            started = performance.now();
        await claude.generate(
            { model, effort: 'low', thread: null, urgent: true, instructions: 'Answer tersely.' },
            text,
            (e) => {
                events.push(e);
                if (e.type === 'item') items.set(e.item, e.text);
            },
            () => {},
            new AbortController().signal,
        );
        await new Promise((resolve) => setTimeout(resolve, 200)); // lets /clear finish
        return {
            text: [...items.values()].join(''),
            status: events.at(-1)?.status,
            ms: performance.now() - started,
        };
    };
    claude.ready(true);
    await new Promise((resolve) => setTimeout(resolve, 8000)); // the start-up happens before any call
    const first = await call('The secret word is banana. Reply OK.', 'haiku');
    assert.equal(first.status, 'completed');
    const second = await call(
        'What is the secret word? If you were not told one, reply UNKNOWN.',
        'sonnet',
    );
    assert.equal(second.status, 'completed');
    assert.match(second.text, /UNKNOWN/);
    assert.doesNotMatch(second.text, /banana/i);
    t.diagnostic(`first call ${Math.round(first.ms)} ms, second ${Math.round(second.ms)} ms`);
});
