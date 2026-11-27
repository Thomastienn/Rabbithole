// Reading and measuring what the tutor wrote in a sketch's lines. Shared by every kind.

// One non-empty line of a sketch body; `at` is its line number, for error messages.
export type Line = { text: string; at: number };

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const plain = (s: string) => s.replace(/\*/g, '').trim();
export const isFocus = (s: string) => /\*[^*]+\*/.test(s);
export const quoted = (line: Line) => `line ${line.at} "${line.text}"`;

// A sketch is as wide as the reading column.
export const WIDTH = 640,
    // shortcut: label width is estimated at 7px per character of the 14px reading face; measure text if labels clip.
    CHAR = 7;

export function wrap(label: string, width: number, char = CHAR) {
    const lines: string[] = [];
    for (const word of label.split(/\s+/)) {
        const last = lines.at(-1);
        if (last !== undefined && (last.length + 1 + word.length) * char <= width)
            lines[lines.length - 1] = `${last} ${word}`;
        else lines.push(word);
    }
    return lines;
}

// A number as written at the start of a value: 1,000 and .5 read, 1.2.3 does not.
export const NUMBER = /^-?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?![\d.,])/i;

// `label: number`, with an optional unit after the number (bars and pie).
export type Quantity = { label: string; value: string; number: string; n: number; focus: boolean };
export function quantity(line: Line): Quantity | { error: string } {
    const colon = line.text.lastIndexOf(':'),
        label = plain(line.text.slice(0, Math.max(colon, 0))),
        value = plain(line.text.slice(colon + 1)),
        number = NUMBER.exec(value)?.[0];
    if (colon < 1 || !label) return { error: `${quoted(line)} is not label: number` };
    if (number === undefined) return { error: `${quoted(line)} has no number` };
    const n = Number(number.replace(/,/g, ''));
    if (!Number.isFinite(n)) return { error: `${quoted(line)} is out of range` };
    return { label, value, number, n, focus: isFocus(line.text) };
}
