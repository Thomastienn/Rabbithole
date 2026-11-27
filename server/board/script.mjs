// Reads the board's line-based stream as it arrives: each complete `> ` line is a spoken sentence and
// every other line is an op of the sentence above it.
export function scriptReader() {
    let rest = '';
    const read = (lines) =>
        lines
            .map((line) => line.trim())
            .filter((line) => line && line !== '>')
            .map((line) =>
                line.startsWith('> ') ? { sentence: line.slice(2).trim() } : { op: line },
            );
    return {
        // The sentences and op lines completed by this chunk of text.
        feed(text) {
            const lines = (rest + text).split('\n');
            rest = lines.pop();
            return read(lines);
        },
        // Whether the line being written is the next sentence, which ends the ops of the one before.
        nextSentence: () => rest.trimStart().startsWith('>'),
        // The last line, which may end without a newline.
        end() {
            const last = rest;
            rest = '';
            return read([last]);
        },
    };
}
