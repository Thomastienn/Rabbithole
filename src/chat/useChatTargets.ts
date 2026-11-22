import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatComposerInputHandle } from '@astryxdesign/core/Chat';
import type { Source } from '../map/TreeOverview';
import type { ChatState } from './useChatState';
import type { Tree } from './types';

// Targets on opening a chat: the composer, a passage to reveal, a figure picked in Contents or a bubble picked on the map.
// useLearningTrees calls it with the open conversation it owns.
export function useChatTargets({ overview }: Pick<ChatState, 'overview'>, tree: Tree | undefined) {
    const [reveal, setReveal] = useState<{ tree: string; source: Source }>();
    const [figureTarget, setFigureTarget] = useState<{ conversation: string; artifact: string }>();
    const [messageTarget, setMessageTarget] = useState<{ conversation: string; message: string }>();
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
                `.focused-chat [data-chat-message="${CSS.escape(messageTarget.message)}"]`,
            );
            if (message && document.activeElement !== message) {
                message.tabIndex = -1;
                message.focus({ preventScroll: true });
            }
            message?.scrollIntoView({ block: 'start' });
            if (++frames < 12) frame = requestAnimationFrame(tick);
            else setMessageTarget(undefined);
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
    // A turn rail pick scrolls the open conversation to that message and keeps its other targets.
    const jump = (conversation: string, message: string) =>
        setMessageTarget({ conversation, message });
    // Deleted conversations keep no passage to reveal.
    const drop = (ids: Set<string>) => setReveal((r) => (r && ids.has(r.tree) ? undefined : r));
    // The next chat to show opens on its composer.
    const focusNext = () => {
        focusComposer.current = true;
    };
    return { reveal, composer, focusNext, goTo, jump, drop };
}

export type ChatTargets = ReturnType<typeof useChatTargets>;
