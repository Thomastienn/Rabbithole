import { useId, useState, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Button } from '@astryxdesign/core/Button';
import { Lightbox } from '@astryxdesign/core/Lightbox';
import type { Artifact } from './artifacts';

const STATUS = { pending: 'Creating video…', ready: 'Video ready.', failed: 'Video could not be generated. Retry, or check Smart in Settings.', canceled: 'Video generation canceled.',
  interrupted: 'Video generation interrupted when TreeTutor stopped.', unavailable: 'Video unavailable: its saved file is missing or unreadable.' };

// Only known server-authored reasons reach the learner; arbitrary worker errors may contain private output.
const FAILURE_REASON = /^(?:Video request could not be read: [^\n]+\.|Tutor reply did not complete\.|Video (?:rendering (?:failed|timed out)|renderer could not start|narration timed out|narration failed\. Check your connection and Retry|could not be saved|composition (?:timed out|did not complete|exceeds 64 KiB|is missing its (?:description|narration)|uses a disallowed import or resource)|provider failed to generate a composition|narration(?: timing)? is (?:missing|unreadable))\.|Rendered video is unreadable\.)$/;

// Only the status line announces; source stays private.
// Library cards pass their own media route and no onAction: their source conversation may be gone, so nothing can regenerate there.
export default function VideoCard({ artifact, inline = false, onAction, media = `/api/trees/${artifact.conversation}/artifacts/${artifact.id}/media`, actions }: { artifact: Pick<Artifact, 'id' | 'title' | 'description' | 'status' | 'available' | 'conversation' | 'phase' | 'progress'> & { error?: string | null }; inline?: boolean; onAction?: (action: 'cancel' | 'retry') => Promise<void>; media?: string; actions?: ReactNode }) {
  const id = useId();
  const [enlarged, setEnlarged] = useState(false);
  const state = artifact.status === 'ready' && artifact.available === false ? 'unavailable' : artifact.status;
  const status = state === 'pending' && inline && artifact.phase === 'rendering' ? `Rendering video…${artifact.progress !== undefined ? ` ${Math.round(artifact.progress * 100)}%` : ''}` : state === 'failed' && inline && FAILURE_REASON.test(artifact.error ?? '') ? artifact.error : STATUS[state];
  return <section className={`video-card ${inline ? 'video-inline' : 'diagram-card'}`} aria-live="off" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} data-artifact={artifact.id} data-state={state}>
    <VStack gap={inline ? 0 : 3} padding={inline ? 0 : 3}>
      <Heading level={3} id={`${id}-title`} className={inline ? 'sr-only' : undefined}>{artifact.title}</Heading>
      <section className={`video-stage${!inline || state === 'ready' ? ' video-frame' : ''}`}>
        {state === 'pending' && !inline && <Skeleton />}
        {state === 'ready' && <video className="video-frame" src={media} controls preload="metadata" aria-label={`Video: ${artifact.title}`} aria-describedby={`${id}-description`} />}
        <VStack gap={2} padding={3} hAlign="center" vAlign="center" className="video-controls">
          <Text type="supporting" color="secondary" role="status" className={state === 'ready' ? 'sr-only' : undefined}><Text type="inherit" className="sr-only">{artifact.title}: </Text>{status}</Text>
          {/* Keep the action mounted so Cancel → Retry/Open large preserves keyboard focus. */}
          {(state === 'ready' || onAction) && <Button key="action" label={state === 'ready' ? 'Open large' : state === 'pending' ? 'Cancel video' : state === 'unavailable' ? 'Regenerate video' : 'Retry video'} variant="ghost" size="sm" clickAction={() => state === 'ready' ? setEnlarged(true) : onAction?.(state === 'pending' ? 'cancel' : 'retry')} />}
        </VStack>
      </section>
      <Text id={`${id}-description`} className={inline ? 'sr-only' : undefined}>{artifact.description}</Text>
      {actions}
      {state === 'ready' && enlarged && <Lightbox isOpen onOpenChange={setEnlarged} hasAutoPlay media={{ src: media, alt: `Video: ${artifact.title}`, caption: artifact.title, type: 'video' }} />}
    </VStack>
  </section>;
}
