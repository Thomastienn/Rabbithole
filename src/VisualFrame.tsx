import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/Layout';
import { useTheme } from '@astryxdesign/core/theme';
import { ArrowPathIcon, ArrowsPointingOutIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { visualMessage, type Artifact, type VisualPart } from './artifacts';

export type VisualBranch = VisualPart & { child: string };
export type PartAction = (artifact: Artifact, part: VisualPart, origin: React.RefObject<HTMLElement | null>) => void;

// Generated code runs only in this frame: scripts without allow-same-origin give it an opaque origin.
function Frame({ artifact, explored = [], reveal, onPart }: { artifact: Artifact; explored?: VisualBranch[]; reveal?: VisualPart; onPart?: PartAction }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();
  const { mode, name } = useTheme();
  const post = (data: object) => frame.current?.contentWindow?.postMessage(data, '*');
  const parts = () => post({ type: 'parts', explored: explored.map(({ label, explanation }) => ({ label, explanation })), ...(reveal && { reveal: { label: reveal.label, explanation: reveal.explanation } }) });
  const partsKey = JSON.stringify({ explored, reveal });
  // The frame inherits nothing from the app, so it receives the current theme tokens; light-dark() values resolve from the scheme.
  const theme = () => {
    const style = getComputedStyle(frame.current!), tokens: Record<string, string> = {};
    for (const name of style) if (name.startsWith('--')) tokens[name] = style.getPropertyValue(name).trim();
    post({ type: 'theme', scheme: mode, tokens });
  };
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const message = visualMessage(event.data);
      if (message?.type === 'height') setHeight(message.height);
      else if (message?.type === 'branch' && artifact.status === 'ready') onPart?.(artifact, { label: message.label, explanation: message.explanation }, frame);
    }
    addEventListener('message', receive);
    return () => removeEventListener('message', receive);
  }, [artifact.status, onPart]);
  useEffect(() => { if (frame.current) theme(); }, [mode, name]);
  useEffect(parts, [partsKey]);
  const ready = height !== undefined;
  return <>
    {!ready && <Skeleton className="visual-shimmer" />}
    <iframe ref={frame} className="visual-frame" src="/sandbox.html" sandbox="allow-scripts" title={artifact.description}
      style={ready ? { height } : undefined} data-ready={ready || undefined}
      onLoad={() => { theme(); post({ type: 'render', source: artifact.source }); parts(); }} />
  </>;
}

export default function VisualFrame({ artifact, explored, reveal, onPart, onRetry, onRegenerate }: { artifact: Artifact; explored?: VisualBranch[]; reveal?: VisualPart; onPart?: PartAction; onRetry?: () => Promise<void>; onRegenerate?: () => Promise<void> }) {
  const [enlarged, setEnlarged] = useState(false);
  const [retried, setRetried] = useState(false);
  const figure = useRef<HTMLElement>(null);
  const viewer = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (retried && artifact.status === 'ready' && document.activeElement === document.body) figure.current?.focus(); }, [retried, artifact.status]);
  async function run(action: () => Promise<void>) {
    setRetried(true); await action();
    requestAnimationFrame(() => { if (document.activeElement === document.body) (figure.current?.querySelector<HTMLElement>('button') ?? figure.current)?.focus(); });
  }
  if (artifact.status === 'canceled') return null;
  return <figure ref={figure} className="visual" tabIndex={-1} aria-label={artifact.description} data-artifact={artifact.id} data-state={artifact.status}>
    {artifact.status === 'pending' && <><Skeleton className="visual-shimmer" /><Text className="sr-only" role="status">Creating visual: {artifact.title}</Text></>}
    {artifact.status === 'ready' && artifact.source && <>
      <Frame key={artifact.source} artifact={artifact} explored={explored} reveal={reveal} onPart={onPart} />
      <HStack className="visual-actions" gap={1}>
        {onRegenerate && <IconButton label={`Try a different version of visual: ${artifact.title}`} tooltip="Try a different version" icon={<ArrowPathIcon />} variant="ghost" size="sm" clickAction={() => run(onRegenerate)} />}
        <IconButton className="visual-enlarge" label={`Enlarge visual: ${artifact.title}`} icon={<ArrowsPointingOutIcon />} variant="ghost" size="sm" onClick={() => setEnlarged(true)} />
      </HStack>
      {enlarged && <Dialog ref={viewer} className="visual-viewer" isOpen onOpenChange={setEnlarged} width="min(64rem, calc(100vw - 2rem))" maxHeight="calc(100dvh - 2rem)" aria-label={artifact.title}>
        {/* Frame keystrokes do not reach the dialog's focus trap; guards catch either boundary. */}
        <span tabIndex={0} className="sr-only" aria-hidden onFocus={() => viewer.current?.querySelector('iframe')?.focus()} />
        <IconButton data-autofocus="" className="viewer-close" label="Close visual" icon={<XMarkIcon />} variant="ghost" size="sm" onClick={() => setEnlarged(false)} />
        <h2>{artifact.title}</h2><p>{artifact.description}</p>
        <Frame artifact={artifact} explored={explored} onPart={(visual, part) => { setEnlarged(false); onPart?.(visual, part, figure); }} />
        <span tabIndex={0} className="sr-only" aria-hidden onFocus={() => viewer.current?.querySelector('button')?.focus()} />
      </Dialog>}
    </>}
    {artifact.status === 'failed' && <ExclamationTriangleIcon className="failure-icon" aria-hidden />}
    {(artifact.status === 'failed' || artifact.status === 'interrupted') && <Text display="block" type="supporting" role="status">Visual unavailable. {artifact.error ?? ''}</Text>}
    {onRetry && (artifact.status === 'failed' || (retried && artifact.status === 'pending')) && <Button key="retry" label="Retry visual" variant="secondary" size="sm" isLoading={artifact.status === 'pending'} clickAction={() => run(onRetry)} />}
  </figure>;
}
