import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { IconButton } from '@astryxdesign/core/IconButton';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { HStack } from '@astryxdesign/core/Layout';
import { useTheme } from '@astryxdesign/core/theme';
import {
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { inkStyle } from '../map/treeList';
import { visualMessage, type Artifact, type VisualPart } from './artifacts';
import { visualProgress } from './visualProgress';

export type VisualBranch = VisualPart & { child: string; address?: string; ink?: number };
export type PartAction = (
  artifact: Artifact,
  part: VisualPart,
  origin: React.RefObject<HTMLElement | null>,
) => void;

// Generated code runs only in this frame: scripts without allow-same-origin give it an opaque origin.
function Frame({ artifact }: { artifact: Artifact }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();
  const loaded = useRef(false);
  const { mode, name } = useTheme();
  const post = (data: object) => frame.current?.contentWindow?.postMessage(data, '*');
  // The frame inherits nothing from the app, so it receives the current theme tokens; light-dark() values resolve from the scheme.
  const theme = () => {
    const style = getComputedStyle(frame.current!),
      tokens: Record<string, string> = {};
    for (const name of style)
      if (name.startsWith('--')) tokens[name] = style.getPropertyValue(name).trim();
    post({ type: 'theme', scheme: mode, tokens });
  };
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const message = visualMessage(event.data);
      if (message?.type === 'height') setHeight(message.height);
    }
    addEventListener('message', receive);
    return () => removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    if (frame.current) theme();
  }, [mode, name]);
  // The frame scales its visual down to the room it has: the viewer's free height, else its scroll area's.
  const room = useRef(0);
  const fit = () => {
    const el = frame.current;
    if (!el || height === undefined) return;
    const dialog = el.closest('dialog'),
      { innerHeight } = el.ownerDocument.defaultView!;
    let box = el.parentElement;
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    // Sticky bars such as the composer cover part of the scroll area; 48px leaves the badge row in view.
    const covered = [...(box?.children ?? [])]
      .filter((child) => getComputedStyle(child).position === 'sticky')
      .reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
    const next = Math.floor(
      dialog
        ? innerHeight - 32 - (dialog.offsetHeight - el.offsetHeight)
        : (box?.clientHeight ?? innerHeight) - covered - 48,
    );
    if (next === room.current) return;
    room.current = next;
    post({ type: 'fit', room: next });
  };
  useEffect(fit, [height]);
  useEffect(() => {
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  });
  // A finished visual gets the stock pieces it names from the app; the frame itself makes no request.
  const render = async () => {
    const source = artifact.source ?? '',
      complete = artifact.status === 'ready';
    const ids = complete
      ? [
          ...new Set(
            [...source.matchAll(/\bstockPiece\s*\(\s*(["'`])([^"'`]*)\1\s*\)/g)].map((m) => m[2]),
          ),
        ]
      : [];
    const pieces = Object.fromEntries(
      await Promise.all(
        ids.map(async (id) => {
          const response = await fetch(`/api/stock/${encodeURIComponent(id)}`).catch(() => null);
          const data = response?.ok ? await response.json() : {};
          // A 3D piece goes to the frame as GLB bytes; its loader turns them into an object there.
          return [
            id,
            data.glb
              ? Uint8Array.from(atob(data.glb), (c) => c.charCodeAt(0)).buffer
              : (data.svg ?? null),
          ];
        }),
      ),
    );
    post({ type: 'render', source, complete, ...(complete && { pieces }) });
  };
  useEffect(() => {
    if (loaded.current) void render();
  }, [artifact.source, artifact.status]);
  const ready = height !== undefined && (artifact.status === 'ready' || !!artifact.source);
  return (
    <>
      {!ready && <Skeleton className="visual-shimmer" />}
      <iframe
        ref={frame}
        className="visual-frame"
        src="/sandbox.html"
        sandbox="allow-scripts"
        title={artifact.description}
        style={ready ? { height } : undefined}
        data-ready={ready || undefined}
        // A partly drawn visual takes no pointer or keyboard input until it finishes.
        inert={artifact.status === 'pending'}
        onLoad={() => {
          theme();
          loaded.current = true;
          void render();
        }}
      />
    </>
  );
}

export default function VisualFrame({
  artifact,
  reveal,
  explored = [],
  onOpenChild,
  onPart,
  onRetry,
  onRegenerate,
}: {
  artifact: Artifact;
  explored?: VisualBranch[];
  onOpenChild?: (id: string) => void;
  reveal?: VisualPart;
  onPart?: PartAction;
  onRetry?: () => Promise<void>;
  onRegenerate?: () => Promise<void>;
}) {
  const [enlarged, setEnlarged] = useState(false);
  const [retried, setRetried] = useState(false);
  const [now, setNow] = useState(Date.now);
  // Where a click on a still-drawing visual landed, to say there why it does not respond.
  const [nudge, setNudge] = useState<number | null>(null);
  const drawing = artifact.status === 'pending';
  useEffect(() => {
    if (!drawing) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [drawing]);
  useEffect(() => {
    if (nudge === null) return;
    const timer = setTimeout(() => setNudge(null), 2400);
    return () => clearTimeout(timer);
  }, [nudge]);
  const progress = visualProgress(artifact, now);
  const figure = useRef<HTMLElement>(null);
  const viewer = useRef<HTMLDialogElement>(null);
  const revealKey = reveal && JSON.stringify(reveal);
  // Returning to a visual's source shows the whole figure; tagged parts no longer take focus.
  useEffect(() => {
    if (!revealKey) return;
    figure.current?.scrollIntoView({ block: 'center' });
    figure.current?.focus();
  }, [revealKey]);
  // The whole visual is the source: the existing visual-part request with its title and description.
  const ask =
    onPart &&
    (() => onPart(artifact, { label: artifact.title, explanation: artifact.description }, figure));
  useEffect(() => {
    if (retried && artifact.status === 'ready' && document.activeElement === document.body)
      figure.current?.focus();
  }, [retried, artifact.status]);
  async function run(action: () => Promise<void>) {
    setRetried(true);
    await action();
    requestAnimationFrame(() => {
      if (document.activeElement === document.body)
        (figure.current?.querySelector<HTMLElement>('button') ?? figure.current)?.focus();
    });
  }
  if (!progress) return null;
  const announcement =
    progress.state === 'drawing'
      ? `Drawing visual: ${artifact.title}`
      : progress.state === 'interactive'
        ? `Visual ready: ${artifact.title}`
        : `Visual unavailable. ${artifact.error ?? ''}`;
  return (
    <figure
      ref={figure}
      className="visual"
      tabIndex={-1}
      aria-label={artifact.description}
      data-artifact={artifact.id}
      data-state={artifact.status}
      data-partial={progress.partial || undefined}
      aria-busy={drawing || undefined}
      // The inert frame passes clicks through to the figure.
      onClick={
        drawing
          ? (event) => setNudge(event.clientY - event.currentTarget.getBoundingClientRect().top)
          : undefined
      }
    >
      {/* One persistent live region, so each state change is announced; the visible badge stays quiet. */}
      <Text className="sr-only" role="status">
        {announcement}
      </Text>
      <Badge
        className="visual-badge"
        aria-hidden
        variant={
          progress.state === 'interactive'
            ? 'success'
            : progress.state === 'drawing'
              ? 'info'
              : 'error'
        }
        label={
          progress.state === 'drawing'
            ? `Drawing… ${progress.elapsed}`
            : progress.state === 'interactive'
              ? 'Interactive'
              : progress.state === 'failed'
                ? 'Failed'
                : 'Interrupted'
        }
      />
      {drawing && <span className="visual-drawing-bar" aria-hidden />}
      {(artifact.status === 'pending' || artifact.status === 'ready') && (
        <Frame key={artifact.id} artifact={artifact} />
      )}
      {drawing && nudge !== null && (
        <Text className="visual-nudge" aria-hidden style={{ top: nudge }}>
          Still drawing. Its controls work once it finishes.
        </Text>
      )}
      {artifact.status === 'ready' && artifact.source && (
        <>
          <HStack className="visual-actions" gap={1} vAlign="center">
            {ask && (
              <Button
                className="visual-ask"
                label="Ask"
                aria-label={`Ask about visual: ${artifact.title}`}
                variant="ghost"
                size="sm"
                onClick={ask}
              />
            )}
            <DropdownMenu
              presentation="popover"
              alignment="end"
              renderTrigger={(props) => (
                <IconButton
                  {...props}
                  label={`Visual actions: ${artifact.title}`}
                  tooltip="More actions"
                  icon={<EllipsisHorizontalIcon />}
                  variant="ghost"
                  size="sm"
                />
              )}
              items={[
                ...(onRegenerate
                  ? [{ label: 'Try a different version', onClick: () => void run(onRegenerate) }]
                  : []),
                { label: 'Enlarge', onClick: () => setEnlarged(true) },
              ]}
            />
          </HStack>
          {enlarged && (
            <Dialog
              ref={viewer}
              className="visual-viewer"
              isOpen
              onOpenChange={setEnlarged}
              width="min(64rem, calc(100vw - 2rem))"
              maxHeight="calc(100dvh - 2rem)"
              aria-label={artifact.title}
            >
              {/* Frame keystrokes do not reach the dialog's focus trap; guards catch either boundary. */}
              <span
                tabIndex={0}
                className="sr-only"
                aria-hidden
                onFocus={() => viewer.current?.querySelector('iframe')?.focus()}
              />
              <IconButton
                data-autofocus=""
                className="viewer-close"
                label="Close visual"
                icon={<XMarkIcon />}
                variant="ghost"
                size="sm"
                onClick={() => setEnlarged(false)}
              />
              <h2>{artifact.title}</h2>
              <p>{artifact.description}</p>
              {ask && (
                <Button
                  label="Ask"
                  aria-label={`Ask about visual: ${artifact.title}`}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEnlarged(false);
                    ask();
                  }}
                />
              )}
              <Frame artifact={artifact} />
              <span
                tabIndex={0}
                className="sr-only"
                aria-hidden
                onFocus={() => viewer.current?.querySelector('button')?.focus()}
              />
            </Dialog>
          )}
        </>
      )}
      {onOpenChild && explored.some((b) => b.address) && (
        <HStack
          className="visual-chips"
          gap={1}
          wrap="wrap"
          role="group"
          aria-label="Branches from this visual"
        >
          {explored
            .filter((b) => b.address)
            .sort((a, b) => a.address!.localeCompare(b.address!, undefined, { numeric: true }))
            .map((b) => (
              <button
                key={b.child}
                type="button"
                className="passage-address"
                style={inkStyle(b.ink ?? 0)}
                aria-label={`Open branch ${b.address}: ${b.label}`}
                onClick={() => onOpenChild(b.child)}
              >
                {b.address}
              </button>
            ))}
        </HStack>
      )}
      {artifact.status === 'failed' && (
        <ExclamationTriangleIcon className="failure-icon" aria-hidden />
      )}
      {(artifact.status === 'failed' || artifact.status === 'interrupted') && (
        <Text display="block" type="supporting" aria-hidden>
          Visual unavailable. {artifact.error ?? ''}
        </Text>
      )}
      {onRetry && (artifact.status === 'failed' || (retried && artifact.status === 'pending')) && (
        <Button
          key="retry"
          label="Retry visual"
          variant="secondary"
          size="sm"
          isLoading={artifact.status === 'pending'}
          clickAction={() => run(onRetry)}
        />
      )}
    </figure>
  );
}
