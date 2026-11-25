import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import {
    CommandPalette,
    CommandPaletteFooter,
    CommandPaletteInput,
    useCommandPaletteContext,
    type CommandPaletteProps,
} from '@astryxdesign/core/CommandPalette';
import type { SearchableItem } from '@astryxdesign/core/Typeahead';
import { inkStyle } from '../map/treeList';
import type { SearchResult } from './treeSearchSource';

type Item = SearchableItem & { auxiliaryData: SearchResult & { group: string; detail?: string } };
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

function SearchInput({
    shown,
    inTree,
    onActive,
}: {
    shown: RefObject<Item[] | undefined>;
    inTree: boolean;
    onActive: (id: string) => void;
}) {
    const palette = useCommandPaletteContext();
    const results = palette?.searchResults as Item[] | undefined;
    // Only committed options can be selected. A cancelled search must not overwrite them.
    useLayoutEffect(() => {
        shown.current = results;
        // Each new list starts on its first row, so Enter opens it at once.
        if (results?.length && palette && palette.highlightedIndex < 0)
            palette.setHighlightedIndex(0);
    }, [results, shown]);
    const active = palette?.selectableItems[palette.highlightedIndex]?.value ?? '';
    useLayoutEffect(() => onActive(active), [active, onActive]);
    const count = palette?.search ? (results?.length ?? 0) : 0;
    const trees = new Set(results?.map((r) => r.auxiliaryData.root)).size;
    return (
        <>
            <CommandPaletteInput
                placeholder="Search inside every conversation"
                endContent={<kbd>Esc</kbd>}
            />
            <p className="search-count" role="status" aria-busy={palette?.isBusy}>
                {count > 0 &&
                    `${count} ${count === 1 ? 'result' : 'results'} in ${trees} ${trees === 1 ? 'learning tree' : 'learning trees'}`}
            </p>
            {/* The empty query names every field searched, so title-only search is not assumed. */}
            {!palette?.search && (
                <p className="search-what">
                    Finds words in every branch: <b>titles</b>, <b>passages</b>,{' '}
                    <b>your questions</b> and <b>the tutor's replies</b>.
                    {inTree && ' Matches in this tree come first.'}
                </p>
            )}
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

// Astryx draws a group heading as one string; the first row overlays it with the name and, apart, its detail.
function Hit({ item, ink }: { item: Item; ink: (conversation: string) => number }) {
    const palette = useCommandPaletteContext();
    const r = item.auxiliaryData;
    const heads =
        r.detail &&
        (palette?.searchResults as Item[] | undefined)?.find(
            (x) => x.auxiliaryData.group === r.group,
        )?.id === item.id;
    return (
        <div className="search-hit" data-recent={r.recent ? '' : undefined}>
            {heads && (
                <span className="search-group" aria-hidden="true">
                    {r.tree}
                    <small>{r.detail}</small>
                </span>
            )}
            <span className="address-chip" style={inkStyle(ink(r.conversation))}>
                {r.address}
            </span>
            <strong title={r.title}>
                {r.field === 'title' && !r.recent ? marked(r.snippet, r.ranges) : r.title}
            </strong>
            <span className="search-where">{r.recent ?? FIELDS[r.field]}</span>
            {r.field !== 'title' && (
                <span className="search-snippet">
                    {r.field === 'passage' && '“'}
                    {marked(r.snippet, r.ranges)}
                    {r.field === 'passage' && '”'}
                </span>
            )}
        </div>
    );
}

export default function TreeSearch({
    searchSource,
    ink,
    onOpen,
    inTree,
    onOpenChange,
    ...props
}: Pick<CommandPaletteProps<Item>, 'isOpen' | 'onOpenChange' | 'searchSource'> & {
    ink: (conversation: string) => number;
    onOpen: (result: SearchResult) => void;
    inTree: boolean;
}) {
    // The palette hands back only an id; the shown items give the whole result.
    const shown = useRef<Item[] | undefined>(undefined);
    // The highlighted row is the palette's value, so it alone reads as selected (aria-selected).
    const [active, setActive] = useState('');
    return (
        <CommandPalette
            {...props}
            className="tree-search-window"
            width="min(760px, calc(100vw - 32px))"
            maxHeight="80vh"
            searchSource={searchSource}
            label="Search inside conversations"
            input={<SearchInput shown={shown} inTree={inTree} onActive={setActive} />}
            footer={
                <CommandPaletteFooter aria-hidden="true">
                    <span>
                        <kbd>
                            <ChevronUpIcon />
                        </kbd>
                        <kbd>
                            <ChevronDownIcon />
                        </kbd>
                        Move
                    </span>
                    <span>
                        <kbd>Enter</kbd>Open
                    </span>
                    <span>
                        <kbd>Esc</kbd>Close
                    </span>
                </CommandPaletteFooter>
            }
            emptyBootstrapText="Type words from any question or reply."
            emptySearchText={<NoMatches />}
            value={active}
            onValueChange={(id) => {
                const item = shown.current?.find((r) => r.id === id);
                if (item) onOpen(item.auxiliaryData);
            }}
            onOpenChange={(open) => {
                // A reopened window starts on its first row, not the last one highlighted.
                if (!open) setActive('');
                onOpenChange(open);
            }}
            renderItem={(item) => <Hit item={item} ink={ink} />}
        />
    );
}
