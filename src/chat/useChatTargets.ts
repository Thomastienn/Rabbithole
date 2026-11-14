import { useEffect, useLayoutEffect } from 'react';
import type { ChatState } from './useChatState';

// Focus targets on opening a chat: the composer, a figure picked in Contents or a bubble picked on the map.
export function useChatTargets(c: ChatState) {
  const { tree, overview, composer, focusComposer, figureTarget, setFigureTarget } = c;
  const { messageTarget, setMessageTarget } = c;
  useEffect(() => {
    if (!overview && tree && focusComposer.current) {
      composer.current?.focus();
      focusComposer.current = false;
    }
  }, [tree?.id, overview]);
  useLayoutEffect(() => {
    if (!figureTarget || overview || tree?.id !== figureTarget.conversation) return;
    const frame = requestAnimationFrame(() => {
      const figure = document.querySelector<HTMLElement>(
        `.focused-chat [data-artifact="${CSS.escape(figureTarget.artifact)}"]`,
      );
      figure?.focus({ preventScroll: true });
      figure?.scrollIntoView({ block: 'center' });
      setFigureTarget(undefined);
    });
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
}
