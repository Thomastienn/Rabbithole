// The whole note goes into every prompt, so it has a size cap.
export const MEMORY_NOTE_LIMIT = 8000;
// A note saved before the cap may be longer; any edit that shortens it still passes.
export const tooLong = (next, current) =>
    next.length > MEMORY_NOTE_LIMIT && next.length > current.length;

const find = (note, old) => {
    if (typeof old !== 'string' || !old.trim())
        throw new Error('Give old_text: the exact entry text to change.');
    const at = note.indexOf(old);
    if (at < 0) throw new Error('old_text is not in the memory note; copy the entry exactly.');
    if (note.indexOf(old, at + 1) >= 0)
        throw new Error(
            'old_text appears more than once in the memory note; include more of the entry.',
        );
    return at;
};
const entry = (text) => {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Give text: the new entry text.');
    return text.trim();
};

// Returns the note after one add, rewrite or delete; throws a readable error for a bad edit.
export function editMemoryNote(note, { operation, text, old_text, heading }) {
    if (operation === 'add') {
        const line = entry(text);
        if (!heading?.trim()) return note.trimEnd() ? `${note.trimEnd()}\n${line}` : line;
        const lines = note.split('\n');
        const title = heading.trim().replace(/^#+\s*/, '');
        const start = lines.findIndex(
            (l) => /^#+\s/.test(l) && l.replace(/^#+\s*/, '').trim() === title,
        );
        if (start < 0)
            return `${note.trimEnd() ? `${note.trimEnd()}\n\n` : ''}## ${title}\n${line}`;
        let end = lines.findIndex((l, i) => i > start && /^#+\s/.test(l));
        if (end < 0) end = lines.length;
        while (end > start + 1 && !lines[end - 1].trim()) end--;
        lines.splice(end, 0, line);
        return lines.join('\n');
    }
    if (operation === 'rewrite') {
        const at = find(note, old_text);
        return note.slice(0, at) + entry(text) + note.slice(at + old_text.length);
    }
    if (operation === 'delete') {
        const at = find(note, old_text);
        let before = note.slice(0, at),
            after = note.slice(at + old_text.length);
        // Drop the emptied line too, so deletes do not leave blank gaps.
        if ((!before || before.endsWith('\n')) && (!after || after.startsWith('\n')))
            after.startsWith('\n')
                ? (after = after.slice(1))
                : (before = before.replace(/\n$/, ''));
        return before + after;
    }
    throw new Error('operation must be add, rewrite or delete.');
}
