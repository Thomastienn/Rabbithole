import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { IconButton } from '@astryxdesign/core/IconButton';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/Layout';
import { useTheme } from '@astryxdesign/core/theme';
import {
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { inkStyle } from '../map/treeList';
import { visualMessage, type Artifact, type VisualPart } from './artifacts';

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
  const render = () =>
    post({
      type: 'render',
      source: artifact.source ?? '',
      complete: artifact.status === 'ready',
    });
  useEffect(() => {
    if (loaded.current) render();
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
        onLoad={() => {
          theme();
          loaded.current = true;
          render();
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
  if (artifact.status === 'canceled') return null;
  return (
    <figure
      ref={figure}
      className="visual"
      tabIndex={-1}
      aria-label={artifact.description}
      data-artifact={artifact.id}
      data-state={artifact.status}
    >
      {artifact.status === 'pending' && (
        <Text className="sr-only" role="status">
          Creating visual: {artifact.title}
        </Text>
      )}
      {(artifact.status === 'pending' || artifact.status === 'ready') && (
        <Frame key={artifact.id} artifact={artifact} />
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
        <HStack className="visual-chips" gap={1} wrap="wrap" role="group" aria-label="Branches from this visual">
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
        <Text display="block" type="supporting" role="status">
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
