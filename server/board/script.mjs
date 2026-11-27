// Reads the board's line-based stream as it arrives: each complete `> ` line is a spoken sentence.
// Op lines are skipped until the board draws them.
export function sentenceReader() {
    let rest = '';
    const sentences = (lines) =>
        lines
            .map((line) => line.trim())
            .filter((line) => line.startsWith('> ') && line.slice(2).trim())
            .map((line) => line.slice(2).trim());
    return {
        // The sentences completed by this chunk of text.
        feed(text) {
            const lines = (rest + text).split('\n');
            rest = lines.pop();
            return sentences(lines);
        },
        // The last line, which may end without a newline.
        end() {
            const last = rest;
            rest = '';
            return sentences([last]);
        },
    };
}
