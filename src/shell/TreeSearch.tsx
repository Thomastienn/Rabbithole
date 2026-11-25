import { useLayoutEffect, useRef, type RefObject } from 'react';
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

function SearchInput({ shown }: { shown: RefObject<Item[] | undefined> }) {
    const palette = useCommandPaletteContext();
    const results = palette?.searchResults as Item[] | undefined;
    // Only committed options can be selected. A cancelled search must not overwrite them.
    useLayoutEffect(() => {
        shown.current = results;
    }, [results, shown]);
    const count = palette?.search ? (results?.length ?? 0) : 0;
    const trees = new Set(results?.map((r) => r.auxiliaryData.root)).size;
    return (
        <>
            <CommandPaletteInput placeholder="Search every conversation" />
            <p className="search-count" role="status" aria-busy={palette?.isBusy}>
                {count > 0 &&
                    `${count} ${count === 1 ? 'result' : 'results'} in ${trees} ${trees === 1 ? 'learning tree' : 'learning trees'}`}
            </p>
        </>
    );
}

function NoMatches() {
    const palette = useCommandPaletteContext();
    if (palette?.isBusy) return null;
    return (
        <div className="search-none">
            <strong>Nothing matches “{palette?.search.trim()}”</strong>
            <p>No conversation uses these words. Try fewer words or part of one.</p>
        </div>
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
    const shown = useRef<Item[] | undefined>(undefined);
    return (
        <CommandPalette
            {...props}
            className="tree-search-window"
            width="min(760px, calc(100vw - 32px))"
            maxHeight="80vh"
            searchSource={searchSource}
            label="Search conversations"
            input={<SearchInput shown={shown} />}
            emptyBootstrapText="Type words from any conversation."
            emptySearchText={<NoMatches />}
            onValueChange={(id) => {
                const item = shown.current?.find((r) => r.id === id);
                if (item) onOpen(item.auxiliaryData);
            }}
            renderItem={({ auxiliaryData: r }) => (
                <div className="search-hit" data-recent={r.recent ? '' : undefined}>
                    <span className="address-chip" style={inkStyle(ink(r.conversation))}>
                        {r.address}
                    </span>
                    <strong title={r.title}>
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
