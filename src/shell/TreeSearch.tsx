import { useMemo, useRef, useState } from 'react';
import {
    CommandPalette,
    CommandPaletteInput,
    useCommandPaletteContext,
    type CommandPaletteProps,
} from '@astryxdesign/core/CommandPalette';
import type { SearchableItem } from '@astryxdesign/core/Typeahead';
import { inkStyle } from '../map/treeList';
import type { SearchResult } from './treeSearchSource';

type Item = SearchableItem & { auxiliaryData: SearchResult & { group: string } };
const FIELDS = { title: 'Title', passage: 'Passage', question: 'Question', reply: 'Reply' };

// The text with its match ranges marked.
function marked(text: string, ranges: [number, number][]) {
    const parts = [];
    let at = 0;
    for (const [start, end] of ranges) {
        parts.push(text.slice(at, start), <mark key={start}>{text.slice(start, end)}</mark>);
        at = end;
    }
    parts.push(text.slice(at));
    return parts;
}

// Seen only: the palette already announces the result count, and the active option.
function Count() {
    const palette = useCommandPaletteContext();
    const results = (palette?.searchResults ?? []) as Item[];
    if (!palette?.search || !results.length) return null;
    const trees = new Set(results.map((r) => r.auxiliaryData.root)).size;
    return (
        <p className="search-count" aria-hidden>
            {results.length} {results.length === 1 ? 'result' : 'results'} in {trees}{' '}
            {trees === 1 ? 'learning tree' : 'learning trees'}
        </p>
    );
}

export default function TreeSearch({
    searchSource,
    ink,
    onOpen,
    ...props
}: Pick<CommandPaletteProps<Item>, 'isOpen' | 'onOpenChange' | 'searchSource'> & {
    ink: (conversation: string) => number;
    onOpen: (result: SearchResult) => void;
}) {
    // The palette hands back only an id; the shown items give the whole result.
    const shown = useRef(new Map<string, SearchResult>());
    const [query, setQuery] = useState('');
    const source = useMemo(() => {
        const remember = (items: Item[]) => {
            shown.current = new Map(items.map((i) => [i.id, i.auxiliaryData]));
            return items;
        };
        return {
            ...searchSource,
            search: async (q: string) => {
                const items = remember(await searchSource.search(q));
                setQuery(q);
                return items;
            },
            bootstrap: () => remember(searchSource.bootstrap() as Item[]),
        };
    }, [searchSource]);
    return (
        <CommandPalette
            {...props}
            className="tree-search-window"
            width="min(760px, calc(100vw - 32px))"
            maxHeight="80vh"
            searchSource={source}
            label="Search conversations"
            input={
                <>
                    <CommandPaletteInput placeholder="Search every conversation" />
                    <Count />
                </>
            }
            emptyBootstrapText="Type words from any conversation."
            emptySearchText={
                <div className="search-none">
                    <strong>Nothing matches “{query.trim()}”</strong>
                    <p>No conversation uses these words. Try fewer words or part of one.</p>
                </div>
            }
            onValueChange={(id) => {
                const result = shown.current.get(id);
                if (result) onOpen(result);
            }}
            renderItem={({ auxiliaryData: r }) => (
                <div className="search-hit">
                    <span className="address-chip" style={inkStyle(ink(r.conversation))}>
                        {r.address}
                    </span>
                    <strong>
                        {r.field === 'title' && !r.recent ? marked(r.snippet, r.ranges) : r.title}
                    </strong>
                    <span className="search-where">{r.recent ?? FIELDS[r.field]}</span>
                    {r.field !== 'title' && (
                        <span className="search-snippet">{marked(r.snippet, r.ranges)}</span>
                    )}
                </div>
            )}
        />
    );
}
