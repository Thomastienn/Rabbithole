import test from 'node:test';
import assert from 'node:assert/strict';
import { discussionTurn } from '../../server/media/discussion-turn.mjs';
import { discussion } from '../fixtures/discussion.mjs';

test('discussion lines stream through every boundary without leaking verdicts or accepting invented speakers', () => {
    const lines = [
        { speaker: 'Jun', text: 'A "trade" needs both sides.\nWhat about \\ roots? 🌱' },
        { speaker: 'Tutor', text: 'Yes, both benefit.' },
    ];
    const raw =
        lines.map(JSON.stringify).join('\n') +
        '\n```rabbithole-verdict\n[{"concept":"Hyphae","level":5,"confidence":"high"}]\n```';
    for (let i = 0; i <= raw.length; i++) {
        const parsed = discussionTurn(raw.slice(0, i), discussion.classmates);
        assert.equal(parsed.error, undefined, `boundary ${i}`);
        parsed.lines.forEach((line, index) => {
            assert.equal(line.speaker, lines[index].speaker);
            assert.ok(lines[index].text.startsWith(line.text));
        });
    }
    const result = discussionTurn(raw, discussion.classmates, true);
    assert.deepEqual(result.lines, lines);
    assert.deepEqual(result.verdicts, [{ concept: 'Hyphae', level: 5, confidence: 'high' }]);
    for (const speaker of ['Learner', 'Other', 'jun']) {
        const failed = discussionTurn(
            JSON.stringify(lines[0]) + '\n' + JSON.stringify({ speaker, text: 'No.' }),
            discussion.classmates,
            true,
        );
        assert.deepEqual(failed.lines, [lines[0]]);
        assert.match(failed.error, /speaker/);
    }
    assert.match(
        discussionTurn('{"speaker":"Jun","text":"cut off', discussion.classmates, true).error,
        /incomplete/,
    );
    assert.match(discussionTurn('', discussion.classmates, true).error, /no lines/);
});
