import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextArea } from '@astryxdesign/core/TextArea';
import { ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';
import { ensureHighlightStyles } from '@astryxdesign/core/CodeBlock';
import type { Point } from '../map/canvas';
import type { Source } from '../map/TreeOverview';
import type { conversationAddresses } from '../map/treeList';
import { underlineRanges, type Message, type Suggestions } from './turn';
import { passageAnchor, type Anchor } from './branch';
import { renderMarkdown, rawOffsets, rawRange } from '../markdown/markdown';
import type { Artifact } from '../media/artifacts';
import VideoCard from '../media/VideoCard';
import VisualFrame, { type PartAction, type VisualBranch } from '../media/VisualFrame';

// Parsing is memoised so streaming chunks and selection state changes reuse the rendered tree.
const Reply = memo(function Reply({
  text,
  reveal,
  underlines,
  inlineArtifacts = [],
  onArtifactAction,
  onVisualPart,
  visualBranches,
}: {
  text: string;
  reveal?: Source;
  underlines: { start: number; end: number; child?: string }[];
  inlineArtifacts?: Artifact[];
  onVisualPart?: PartAction;
  visualBranches?: Record<string, VisualBranch[]>;
  onArtifactAction?: (id: string, action: 'cancel' | 'retry' | 'regenerate') => Promise<void>;
}) {
  useEffect(ensureHighlightStyles, []);
  const action = useRef(onArtifactAction),
    partAction = useRef(onVisualPart);
  action.current = onArtifactAction;
  partAction.current = onVisualPart;
  const key = JSON.stringify(underlines),
    artifactKey = JSON.stringify(inlineArtifacts),
    visualBranchKey = JSON.stringify(visualBranches);
  return (
    <Text as="div" type="body" className="reply-md">
      {useMemo(
        () =>
          renderMarkdown(
            text,
            reveal?.artifactId === undefined ? reveal : undefined,
            underlines,
            inlineArtifacts.map((v) => ({
              at: v.position!,
              node:
                v.kind === 'video' ? (
                  <VideoCard
                    key={v.id}
                    inline
                    artifact={v}
                    onAction={onArtifactAction && ((kind) => action.current!(v.id, kind))}
                  />
                ) : (
                  <VisualFrame
                    key={v.id}
                    artifact={v}
                    explored={visualBranches?.[v.id]}
                    reveal={reveal?.artifactId === v.id ? reveal : undefined}
                    onPart={(...args) => partAction.current?.(...args)}
                    onRetry={onArtifactAction && (() => action.current!(v.id, 'retry'))}
                    onRegenerate={onArtifactAction && (() => action.current!(v.id, 'regenerate'))}
                  />
                ),
            })),
          ),
        [
          text,
          reveal?.start,
          reveal?.end,
          reveal?.text,
          key,
          artifactKey,
          visualBranchKey,
          reveal?.artifactId,
          !!onArtifactAction,
        ],
      )}
    </Text>
  );
});

export default function Passage({
  message,
  addresses,
  index,
  onBranch,
  onOpenChild,
  reveal,
  selecting,
  openSelection,
  closeSelection,
  form,
  suggestions,
  branched,
  inlineArtifacts,
  onArtifactAction,
  onVisualPart,
  visualBranches,
}: {
  message: Message;
  addresses: ReturnType<typeof conversationAddresses>;
  index: number;
  inlineArtifacts?: Artifact[];
  onVisualPart?: PartAction;
  visualBranches?: Record<string, VisualBranch[]>;
  onArtifactAction?: (id: string, action: 'cancel' | 'retry' | 'regenerate') => Promise<void>;
  suggestions?: Suggestions;
  branched: { start: number; end: number; text: string; child: string }[];
  onBranch: (anchor: Anchor, origin: React.RefObject<HTMLElement | null>) => void;
  onOpenChild: (id: string) => void;
  reveal?: Source;
  selecting: boolean;
  openSelection: () => void;
  closeSelection: () => void;
  form?: { node: React.ReactNode; at?: Anchor['at']; start?: number; end?: number };
}) {
  const formOpen = !!form;
  const highlighted = useRef(false);
  // place is where a pointer highlight's passage box floats once Ask is clicked.
  const [anchor, setAnchor] = useState<Anchor & { at?: Point; place?: Anchor['at'] }>();
  const wrapper = useRef<HTMLElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const passage = useRef<HTMLElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const completed = message.status === 'completed';
  const branchKey = JSON.stringify(branched);
  const underlines = useMemo(
    () =>
      completed
        ? underlineRanges(message.text, suggestions, branched).map((u) =>
            u.child ? { ...u, ...addresses.get(u.child) } : u,
          )
        : [],
    [completed, message.text, suggestions, branchKey, addresses],
  );
  useLayoutEffect(() => {
    const box = floating.current;
    if (!box) return;
    const position = () => {
      box.style.transform = '';
      const top = wrapper
        .current!.closest('.focused-chat')!
        .querySelector('.chat-header')!
        .getBoundingClientRect().bottom;
      const at = form?.at;
      if (at && box.getBoundingClientRect().top < top)
        box.style.transform = `translateY(calc(${(at.below ?? at.y) - at.y}px + 2 * var(--spacing-1)))`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(box);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  }, [formOpen, form?.at?.y, form?.at?.below]);
  useEffect(() => {
    const highlight = reveal && passage.current?.querySelector<HTMLElement>('mark, [data-reveal]');
    if (!highlight) return;
    highlight.scrollIntoView({ block: 'center' });
    highlight.focus?.({ preventScroll: true });
    // ChatLayout jumps to the bottom on the frame after mount; reveal again if that jump hid the passage.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const box = highlight.getBoundingClientRect();
        if (box.bottom < 0 || box.top > innerHeight) highlight.scrollIntoView({ block: 'center' });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [reveal]);
  // While the box is open its passage is painted with the CSS Custom Highlight API, leaving the DOM and native selection alone.
  useLayoutEffect(() => {
    const root = passage.current,
      range =
        form &&
        root &&
        typeof Highlight !== 'undefined' &&
        form.start !== undefined &&
        form.end !== undefined &&
        rawRange(root, form.start, form.end);
    if (!range) return;
    const mine = new Highlight(range);
    CSS.highlights.set('passage', mine);
    return () => {
      if (CSS.highlights.get('passage') === mine) CSS.highlights.delete('passage');
    };
  }, [form?.start, form?.end, formOpen, message.text, underlines, reveal]);
  function capture(start: number, end: number, at?: Point, place?: Anchor['at']) {
    const picked = passageAnchor(message, start, end);
    setAnchor(picked && { ...picked, at, place });
  }
  function captureSelection(e: React.MouseEvent | React.KeyboardEvent) {
    highlighted.current = false;
    if (!completed) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) {
      setAnchor(undefined);
      return;
    }
    const range = selection.getRangeAt(0),
      root = passage.current;
    if (!root?.contains(range.startContainer) || !root.contains(range.endContainer)) {
      setAnchor(undefined);
      return;
    }
    const span = rawOffsets(root, range);
    if (!span) {
      setAnchor(undefined);
      return;
    }
    // Float the action just under the end of the selection, inside this reply.
    const rects = range.getClientRects(),
      last = rects[rects.length - 1],
      box = wrapper.current!.getBoundingClientRect();
    // A pointer highlight keeps the native selection (copy works) and only shows Ask; it wins over any underline it covers.
    const pointer = e.type === 'mouseup' && span.end > span.start;
    highlighted.current = pointer;
    capture(
      span.start,
      span.end,
      last && { x: Math.min(last.right - box.left, box.width), y: last.bottom - box.top },
      pointer ? { x: 0, y: rects[0].top - box.top, below: last.bottom - box.top } : undefined,
    );
  }
  // An unexplored underline opens the passage textbox; an explored one opens its existing child.
  function activate(target: EventTarget) {
    const piece = (target as Element).closest?.('u.suggestion') as HTMLElement | null;
    const u =
      piece && underlines.find((u) => +piece.dataset.o! >= u.start && +piece.dataset.o! < u.end);
    if (!u || !completed) return false;
    if (u.child) {
      onOpenChild(u.child);
      return true;
    }
    const stop =
      [...passage.current!.querySelectorAll<HTMLElement>('u.suggestion[tabindex]')].find(
        (e) => +e.dataset.o! >= u.start && +e.dataset.o! < u.end,
      ) ?? piece;
    setAnchor(undefined);
    const stopBox = stop.getBoundingClientRect(),
      top = wrapper.current!.getBoundingClientRect().top;
    onBranch(
      {
        messageId: message.id,
        start: u.start,
        end: u.end,
        text: message.text.slice(u.start, u.end),
        suggestion: true,
        at: { x: 0, y: stopBox.top - top, below: stopBox.bottom - top },
      },
      { current: stop },
    );
    return true;
  }
  useEffect(() => {
    function dismiss(e: PointerEvent) {
      if (
        !passage.current?.contains(e.target as Node) &&
        !action.current?.contains(e.target as Node) &&
        !selecting &&
        !formOpen
      )
        setAnchor(undefined);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [selecting, formOpen]);
  const ask = anchor && !formOpen && (
    <Button
      ref={action}
      label="Ask about selection"
      variant="primary"
      size="sm"
      elevation="med"
      icon={<ChatBubbleBottomCenterTextIcon />}
      onClick={() => {
        const { place, ...picked } = anchor;
        // Pointer Ask opens the box floating above the passage and returns focus to the reply; keyboard Ask keeps the inline box.
        if (place) {
          setAnchor(undefined);
          onBranch({ ...picked, at: place }, passage);
        } else onBranch({ ...picked, at: undefined }, action);
      }}
    />
  );
  return (
    <VStack
      ref={wrapper}
      gap={2}
      className="passage"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && (anchor || selecting)) {
          e.preventDefault();
          e.stopPropagation();
          setAnchor(undefined);
          closeSelection();
          passage.current?.focus();
        }
      }}
    >
      <section
        ref={passage}
        tabIndex={-1}
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        onClick={(e) => {
          if (!highlighted.current) activate(e.target);
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && activate(e.target)) e.preventDefault();
        }}
      >
        <Reply
          text={
            message.text ||
            (message.status === 'streaming'
              ? message.phase === 'compacting'
                ? 'Compacting parent context…'
                : 'Thinking…'
              : '')
          }
          reveal={reveal}
          underlines={underlines}
          inlineArtifacts={inlineArtifacts}
          onArtifactAction={onArtifactAction}
          onVisualPart={onVisualPart}
          visualBranches={visualBranches}
        />
      </section>
      {/* Mounted before suggestions arrive so their arrival is announced once; reopened replies are not re-announced. */}
      <Text role="status" className="sr-only">
        {underlines.length
          ? `${underlines.length} suggested ${underlines.length === 1 ? 'passage' : 'passages'} in tutor reply ${index}`
          : ''}
      </Text>
      {completed && !selecting && (
        <Button
          className="focus-reveal"
          label={`Select passage in tutor reply ${index}`}
          variant="ghost"
          size="sm"
          onClick={openSelection}
        />
      )}
      {selecting && (
        <>
          <TextArea
            label="Select tutor passage"
            description="Hold Shift and use arrow keys to select. Tab to Ask about selection."
            value={message.text}
            isReadOnly
            rows={4}
            hasAutoFocus
            onSelect={(e) => {
              const input = e.target as HTMLTextAreaElement;
              capture(input.selectionStart, input.selectionEnd);
            }}
          />
        </>
      )}
      {ask &&
        (anchor.at ? (
          <HStack className="selection-action" style={{ left: anchor.at.x, top: anchor.at.y }}>
            {ask}
          </HStack>
        ) : (
          ask
        ))}
      {form &&
        (form.at ? (
          <VStack ref={floating} className="passage-box" style={{ top: form.at.y }}>
            {form.node}
          </VStack>
        ) : (
          form.node
        ))}
      {selecting && (
        <Button
          label="Close passage selection"
          variant="ghost"
          size="sm"
          onClick={() => {
            setAnchor(undefined);
            closeSelection();
            passage.current?.focus();
          }}
        />
      )}
    </VStack>
  );
}
