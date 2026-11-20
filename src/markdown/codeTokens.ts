// Prism only tokenizes; the renderer builds React spans from the offsets. Its page highlighter stays off
// and its autoloader is never imported. Core and each grammar load the first time a fence uses them.
type Stream = string | { type: string; alias?: string | string[]; content: Stream } | Stream[];
type Prism = {
    languages: Record<string, object>;
    tokenize(code: string, grammar: object): Stream[];
};
type Meta = { require?: string | string[]; alias?: string | string[] };
export type CodeToken = { start: number; end: number; type: string };

const PLAIN = new Set(['', 'text', 'plaintext', 'plain', 'txt']);
// Prism token types and aliases onto the themes' syntax roles (astryx-token-<role>); others stay plain.
const ROLES: Record<string, string> = {
    keyword: 'keyword',
    atrule: 'keyword',
    rule: 'keyword',
    important: 'keyword',
    string: 'string',
    char: 'string',
    regex: 'string',
    url: 'string',
    'attr-value': 'string',
    comment: 'comment',
    prolog: 'comment',
    doctype: 'comment',
    cdata: 'comment',
    number: 'number',
    function: 'function',
    'function-name': 'function',
    builtin: 'type',
    'class-name': 'type',
    namespace: 'type',
    tag: 'tag',
    selector: 'tag',
    'attr-name': 'attribute',
    property: 'property',
    operator: 'operator',
    boolean: 'constant',
    constant: 'constant',
    symbol: 'constant',
    punctuation: 'punctuation',
    variable: 'variable',
    parameter: 'variable',
};

const list = (v?: string | string[]) => (v === undefined ? [] : [v].flat());
const ready = new Map<string, (code: string) => Stream[]>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;
let core: Promise<{ prism: Prism; meta: Record<string, Meta> }> | undefined;

// Re-render subscription: the version bumps whenever a grammar finishes loading.
export const grammars = {
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
    },
    version: () => version,
};

export function loadLanguage(label: string): Promise<void> {
    const lang = label.toLowerCase();
    if (PLAIN.has(lang)) return Promise.resolve();
    let pending = loading.get(lang);
    if (!pending) {
        core ??= (async () => {
            (globalThis as { Prism?: object }).Prism ??= {
                manual: true,
                disableWorkerMessageHandler: true,
            };
            const [prism, components] = await Promise.all([
                import('prismjs'),
                import('prismjs/components.js'),
            ]);
            return { prism: prism.default, meta: components.default.languages };
        })();
        pending = core
            .then(async ({ prism, meta }) => {
                const id = Object.keys(meta).find(
                    (k) => k !== 'meta' && (k === lang || list(meta[k].alias).includes(lang)),
                );
                if (!id) return;
                const load = async (id: string): Promise<void> => {
                    if (prism.languages[id]) return;
                    await Promise.all(list(meta[id].require).map(load));
                    await import(`../../node_modules/prismjs/components/prism-${id}.min.js`);
                };
                await load(id);
                const grammar = prism.languages[id];
                ready.set(lang, (code) => prism.tokenize(code, grammar));
                version++;
                listeners.forEach((l) => l());
            })
            // A grammar that fails to load leaves its fences plain.
            .catch(() => {});
        loading.set(lang, pending);
    }
    return pending;
}

// Per-line [start, end) token offsets over code with \n line endings; [] until the grammar is loaded.
export function codeTokens(code: string, label: string): CodeToken[][] {
    const tokenize = ready.get(label.toLowerCase());
    if (!tokenize) {
        void loadLanguage(label);
        return [];
    }
    const lines: CodeToken[][] = [[]];
    let col = 0;
    const walk = (s: Stream, role: string): void => {
        if (Array.isArray(s)) return s.forEach((x) => walk(x, role));
        if (typeof s !== 'string')
            return walk(
                s.content,
                [s.type, ...list(s.alias)].map((t) => ROLES[t]).find(Boolean) ?? role,
            );
        s.split('\n').forEach((part, i) => {
            if (i) (lines.push([]), (col = 0));
            if (role && part)
                lines.at(-1)!.push({ start: col, end: col + part.length, type: role });
            col += part.length;
        });
    };
    walk(tokenize(code), '');
    return lines;
}
