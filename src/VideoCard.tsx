import { useId, useState, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Button } from '@astryxdesign/core/Button';
import { Lightbox } from '@astryxdesign/core/Lightbox';
import type { Artifact } from './artifacts';

const STATUS = { pending: 'Creating video…', ready: 'Video ready.', failed: 'Video could not be generated. Retry, or check Smart in Settings.', canceled: 'Video generation canceled.',
  interrupted: 'Video generation interrupted when TreeTutor stopped.', unavailable: 'Video unavailable: its saved file is missing or unreadable.' };

// Only the status line announces; production stages and source stay private.
// Library cards pass their own media route and no onAction: their source conversation may be gone, so nothing can regenerate there.
export default function VideoCard({ artifact, onAction, media = `/api/trees/${artifact.conversation}/artifacts/${artifact.id}/media`, actions }: { artifact: Pick<Artifact, 'id' | 'title' | 'description' | 'status' | 'available' | 'conversation'>; onAction?: (action: 'cancel' | 'retry') => Promise<void>; media?: string; actions?: ReactNode }) {
  const id = useId();
  const [enlarged, setEnlarged] = useState(false);
  const state = artifact.status === 'ready' && artifact.available === false ? 'unavailable' : artifact.status;
  return <section className="diagram-card video-card" aria-live="off" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} data-artifact={artifact.id} data-state={state}>
    <VStack gap={3} padding={3}>
      <Heading level={3} id={`${id}-title`}>{artifact.title}</Heading>
      <section className="video-frame video-stage">
        {state === 'pending' && <Skeleton />}
        {state === 'ready' && <video className="video-frame" src={media} controls preload="metadata" aria-label={`Video: ${artifact.title}`} aria-describedby={`${id}-description`} />}
        <VStack gap={2} padding={3} hAlign="center" vAlign="center" className="video-controls">
          <Text type="supporting" color="secondary" role="status" className={state === 'ready' ? 'sr-only' : undefined}><Text type="inherit" className="sr-only">{artifact.title}: </Text>{STATUS[state]}</Text>
          {/* Keep the action mounted so Cancel → Retry/Open large preserves keyboard focus. */}
          {(state === 'ready' || onAction) && <Button key="action" label={state === 'ready' ? 'Open large' : state === 'pending' ? 'Cancel video' : state === 'unavailable' ? 'Regenerate video' : 'Retry video'} variant="ghost" size="sm" clickAction={() => state === 'ready' ? setEnlarged(true) : onAction?.(state === 'pending' ? 'cancel' : 'retry')} />}
        </VStack>
      </section>
      <Text id={`${id}-description`}>{artifact.description}</Text>
      {actions}
      {state === 'ready' && enlarged && <Lightbox isOpen onOpenChange={setEnlarged} hasAutoPlay media={{ src: media, alt: `Video: ${artifact.title}`, caption: artifact.title, type: 'video' }} />}
    </VStack>
  </section>;
}
