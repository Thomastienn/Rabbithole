import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUT_STATES, cutState, playable } from '../../server/media/cut-state.mjs';

const timing = { durationInFrames: 90 };

test("a cut's state follows its saved fields, and only a ready cut plays", () => {
    const cases = [
        [{ engine: 'remotion', status: 'writing', code: null, timing: null }, 'writing'],
        [{ engine: 'remotion', status: 'writing', code: null, timing }, 'writing'],
        [{ engine: 'remotion', status: 'writing', code: 'x', timing: null }, 'narrating'],
        [{ engine: 'remotion', status: 'writing', code: 'x', timing }, 'auditing'],
        [{ engine: 'remotion', status: 'writing', code: 'x', timing, step: 'fixing' }, 'fixing'],
        // A kept, audited cut moves back while it is repaired.
        [{ engine: 'remotion', code: 'x', timing, audited: true, step: 'repairing' }, 'repairing'],
        [{ engine: 'manim', code: 'x', timing, audited: true }, 'auditing'],
        [{ engine: 'remotion', status: 'failed', code: 'x', timing, audited: true }, 'failed'],
        // Cuts of a video saved before the state had a name.
        [{ engine: 'remotion', status: 'written', code: 'x', timing, audited: true }, 'ready'],
        [
            { engine: 'manim', status: 'written', code: 'x', timing, audited: true, clip: 'c' },
            'ready',
        ],
    ];
    for (const [cut, state] of cases) {
        assert.equal(cutState(cut), state, JSON.stringify(cut));
        assert.equal(playable(cut), state === 'ready');
        assert.ok(cutState(cut) in CUT_STATES);
    }
});
