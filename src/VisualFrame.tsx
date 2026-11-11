import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Text } from '@astryxdesign/core/Text';
import { useTheme } from '@astryxdesign/core/theme';
import { ArrowsPointingOutIcon } from '@heroicons/react/24/outline';
import { visualMessage, type Artifact, type VisualMessage } from './artifacts';

// Generated code runs only in this frame: scripts without allow-same-origin give it an opaque origin.
function Frame({ artifact, onPart }: { artifact: Artifact; onPart?: (part: Extract<VisualMessage, { type: 'branch' }>) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();
  const { mode } = useTheme();
  const post = (data: object) => frame.current?.contentWindow?.postMessage(data, '*');
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
      // shortcut: branch requests are validated but not acted on until branch-from-visual lands.
      else if (message?.type === 'branch' && artifact.status === 'ready') onPart?.(message);
    }
    addEventListener('message', receive);
    return () => removeEventListener('message', receive);
  }, [artifact.status, onPart]);
  useEffect(() => { if (frame.current) theme(); }, [mode]);
  const ready = height !== undefined;
  return <>
    {!ready && <Skeleton className="visual-shimmer" />}
    <iframe ref={frame} className="visual-frame" src="/sandbox.html" sandbox="allow-scripts" title={artifact.description}
      style={ready ? { height } : undefined} data-ready={ready || undefined}
      onLoad={() => { theme(); post({ type: 'render', source: artifact.source }); }} />
  </>;
}

export default function VisualFrame({ artifact }: { artifact: Artifact }) {
  const [enlarged, setEnlarged] = useState(false);
  return <figure className="visual" data-artifact={artifact.id} data-state={artifact.status}>
    {artifact.status === 'pending' && <><Skeleton className="visual-shimmer" /><Text className="sr-only" role="status">Creating visual: {artifact.title}</Text></>}
    {artifact.status === 'ready' && artifact.source && <>
      <Frame key={artifact.source} artifact={artifact} />
      <IconButton className="visual-enlarge" label={`Enlarge visual: ${artifact.title}`} icon={<ArrowsPointingOutIcon />} variant="ghost" size="sm" onClick={() => setEnlarged(true)} />
      {enlarged && <Dialog isOpen onOpenChange={setEnlarged} width="min(64rem, calc(100vw - 2rem))" maxHeight="calc(100dvh - 2rem)" aria-label={artifact.title}><Frame artifact={artifact} /></Dialog>}
    </>}
    {(artifact.status === 'failed' || artifact.status === 'interrupted') && <Text type="supporting" color="secondary" role="status">Visual unavailable. {artifact.error ?? ''}</Text>}
  </figure>;
}
