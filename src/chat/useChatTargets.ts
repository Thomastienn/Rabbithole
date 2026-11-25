import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatComposerInputHandle } from '@astryxdesign/core/Chat';
import type { Source } from '../map/TreeOverview';
import type { SearchResult } from '../shell/treeSearchSource';
import type { ChatState } from './useChatState';
import type { Tree } from './types';

const searchContent = {
    title: '.chat-title h2',
    passage: '.origin-source',
    question: '.origin-question, .question-bubble .reply-md',
    reply: '.passage > section > .reply-md',
};

// Targets on opening a chat: the composer, a passage to reveal, a figure picked in Contents or a bubble picked on the map.
// useLearningTrees calls it with the open conversation it owns.
export function useChatTargets({ overview }: Pick<ChatState, 'overview'>, tree: Tree | undefined) {
    const [reveal, setReveal] = useState<{ tree: string; source: Source }>();
    const [figureTarget, setFigureTarget] = useState<{ conversation: string; artifact: string }>();
    // No message opens at the title; `words` are marked briefly once the target shows.
    const [messageTarget, setMessageTarget] = useState<{
        conversation: string;
        message?: string;
        field?: SearchResult['field'];
        words?: string[];
    }>();
    const composer = useRef<ChatComposerInputHandle>(null);
    // Set to focus the composer once the next chat shows.
    const focusComposer = useRef(false);
    useEffect(() => {
        if (!overview && tree && focusComposer.current) {
            composer.current?.focus();
            focusComposer.current = false;
        }
    }, [tree?.id, overview]);
    useLayoutEffect(() => {
        if (!figureTarget || overview || tree?.id !== figureTarget.conversation) return;
        // Held like a message target below, so ChatLayout's jump to the bottom does not win.
        let frame = 0,
            frames = 0;
        const tick = () => {
            const figure = document.querySelector<HTMLElement>(
                `.focused-chat [data-artifact="${CSS.escape(figureTarget.artifact)}"]`,
            );
            if (figure && document.activeElement !== figure) figure.focus({ preventScroll: true });
            figure?.scrollIntoView({ block: 'center' });
            if (++frames < 12) frame = requestAnimationFrame(tick);
            else setFigureTarget(undefined);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [tree?.id, overview, figureTarget]);
    // A bubble picked on the map opens with that message's top at the reading area top.
    useLayoutEffect(() => {
        if (!messageTarget || overview || tree?.id !== messageTarget.conversation) return;
        // ChatLayout follows the bottom until its scroll listener sees the reader move up, so hold the position for a few frames.
        let frame = 0,
            frames = 0;
        const tick = () => {
            const message = document.querySelector<HTMLElement>(
                messageTarget.message
                    ? `.focused-chat [data-chat-message="${CSS.escape(messageTarget.message)}"]`
                    : '.focused-chat .chat-title',
            );
            if (message && document.activeElement !== message) {
                message.tabIndex = -1;
                message.focus({ preventScroll: true });
            }
            message?.scrollIntoView({ block: 'start' });
            if (++frames < 12) frame = requestAnimationFrame(tick);
            else {
                if (message && messageTarget.field && messageTarget.words?.length) {
                    const container = messageTarget.message
                        ? message
                        : message.closest('.focused-chat');
                    const content = container?.querySelector(searchContent[messageTarget.field]);
                    if (content) markWords(content, messageTarget.words);
                }
                setMessageTarget(undefined);
            }
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [tree?.id, overview, messageTarget]);

    // Conversation `id` opens on one target, or on the composer when none is given.
    function goTo(id: string, source?: Source, artifact?: string, message?: string) {
        setReveal(source ? { tree: id, source } : undefined);
        setFigureTarget(artifact ? { conversation: id, artifact } : undefined);
        setMessageTarget(message ? { conversation: id, message } : undefined);
        focusComposer.current = !source && !artifact && !message;
    }
    // A search result opens on its matched message, or at the title for a title, passage or question match.
    function find({ conversation, message, field, ranges, snippet }: SearchResult) {
        goTo(conversation);
        focusComposer.current = false;
        setMessageTarget({
            conversation,
            message,
            field,
            words: ranges.map(([start, end]) => snippet.slice(start, end)),
        });
    }
    // A turn rail pick scrolls the open conversation to that message and keeps its other targets.
    const jump = (conversation: string, message: string) =>
        setMessageTarget({ conversation, message });
    // Deleted conversations keep no passage to reveal.
    const drop = (ids: Set<string>) => setReveal((r) => (r && ids.has(r.tree) ? undefined : r));
    // The next chat to show opens on its composer.
    const focusNext = () => {
        focusComposer.current = true;
    };
    return { reveal, composer, focusNext, goTo, find, jump, drop };
}

// Match original text offsets, including words split by inline Markdown.
export function markWords(root: Element, words: string[]) {
    if (typeof Highlight === 'undefined' || !CSS.highlights) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: { node: Node; offset: number }[] = [];
    let text = '';
    let previousBlock: Element | null | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent) continue;
        const block = node.parentElement?.closest('p, li, pre, td, th, h1, h2, h3, h4, h5, h6');
        if (block !== previousBlock && text) text += ' ';
        nodes.push({ node, offset: text.length });
        text += node.textContent;
        previousBlock = block;
    }
    const mine = new Highlight();
    for (const word of new Set(words.filter(Boolean))) {
        const literal = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let start = 0;
        let end = 0;
        for (const match of text.matchAll(new RegExp(literal, 'giu'))) {
            const from = match.index;
            const to = from + match[0].length;
            while (start + 1 < nodes.length && nodes[start + 1].offset <= from) start++;
            end = Math.max(start, end);
            while (end + 1 < nodes.length && nodes[end + 1].offset < to) end++;
            const range = document.createRange();
            range.setStart(nodes[start].node, from - nodes[start].offset);
            range.setEnd(nodes[end].node, to - nodes[end].offset);
            mine.add(range);
        }
    }
    if (!mine.size) return;
    CSS.highlights.set('search-match', mine);
    setTimeout(() => {
        if (CSS.highlights.get('search-match') === mine) CSS.highlights.delete('search-match');
    }, 2000);
}

export type ChatTargets = ReturnType<typeof useChatTargets>;
