// Reads the board's line-based stream as it arrives: each complete `> ` line is a spoken sentence, a `?> `
// line is a spoken question for the learner, a `~> ` line a spoken check-in, a `!> ` line a spoken sentence marked key,
// and every other line is an op of the sentence above it.
function scriptReader() {
    let rest = '';
    const read = (lines) =>
        lines
            .map((line) => line.trim())
            .filter(
                (line) => line && line !== '>' && line !== '?>' && line !== '~>' && line !== '!>',
            )
            .map((line) =>
                line.startsWith('> ')
                    ? { sentence: line.slice(2).trim() }
                    : line.startsWith('?> ')
                      ? { sentence: line.slice(3).trim(), question: true }
                      : line.startsWith('~> ')
                        ? { sentence: line.slice(3).trim(), checkIn: true }
                        : line.startsWith('!> ')
                          ? { sentence: line.slice(3).trim(), key: true }
                          : { op: line },
            );
    return {
        // The sentences and op lines completed by this chunk of text.
        feed(text) {
            const lines = (rest + text).split('\n');
            rest = lines.pop();
            return read(lines);
        },
        // Whether the line being written is the next sentence, which ends the ops of the one before.
        nextSentence: () => /^[?~!]?>/.test(rest.trimStart()),
        // The last line, which may end without a newline.
        end() {
            const last = rest;
            rest = '';
            return read([last]);
        },
    };
}

// A sentence's prosody rate in percent (docs/board-sketches-spec.md, Pacing): a key sentence and one drawing math
// are said slower, the slower of the two when both apply; the client stretches its caption estimate to match.
const KEY_RATE = -15;
const MATH_RATE = -10;
const MATH = new Set(['math', 'equation', 'symbol']);
const sentenceRate = (sentence) =>
    Math.min(
        sentence.key ? KEY_RATE : 0,
        sentence.ops.some((op) => MATH.has(op.kind)) ? MATH_RATE : 0,
    );

// A `pause S` line (docs/board-polish-spec.md): the tutor's pause after its sentence, S seconds of board time.
const PAUSE = /^pause(\s|$)/;
const pauseMs = (line) => {
    const m = /^pause\s+(\d*\.?\d+)$/.exec(line);
    return m && Math.round(Math.min(2, Math.max(0.2, +m[1])) * 1000);
};

// A reply's sentences as the stream arrives: each with its ops read through the board's guard, its op lines,
// its rate and the pause the tutor wrote after it, which the reply's last sentence drops. A sentence goes to done() once its ops are all written: when the next sentence starts or the
// reply ends. read(op) returns { item, moved, error }; moved(item) and skipped(error) report the guard's fixes.
export function scriptSentences({ read, id, done, moved, skipped }) {
    const reader = scriptReader();
    let writing = null;
    const flush = (last = false) => {
        if (!writing) return;
        const sentence = writing;
        writing = null;
        sentence.rate = sentenceRate(sentence);
        if (last) delete sentence.pause;
        done(sentence);
    };
    const add = (lines, ended = false) => {
        for (const line of lines) {
            if (line.sentence !== undefined) {
                flush();
                writing = {
                    id: id(),
                    text: line.sentence,
                    question: line.question,
                    checkIn: line.checkIn,
                    key: line.key,
                    ops: [],
                    lines: [],
                };
                continue;
            }
            if (writing && PAUSE.test(line.op)) {
                const ms = pauseMs(line.op);
                if (ms) writing.pause = ms;
                else skipped('pause needs seconds');
                continue;
            }
            const {
                item,
                moved: fixed,
                error,
            } = writing ? read(line.op) : { error: 'op before its sentence' };
            if (fixed) moved(item);
            if (item) {
                writing.ops.push(item);
                writing.lines.push(line.op);
            } else if (error) skipped(error);
        }
        if (ended || reader.nextSentence()) flush(ended);
    };
    return { feed: (text) => add(reader.feed(text)), end: () => add(reader.end(), true) };
}
