import { useId, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Button } from '@astryxdesign/core/Button';
import { Lightbox } from '@astryxdesign/core/Lightbox';
import type { Artifact } from './artifacts';

const STATUS = { preparing: 'Preparing video…', rendering: 'Rendering video…', ready: 'Video ready.', failed: 'Video could not be generated.', canceled: 'Video generation canceled.',
  interrupted: 'Video generation interrupted when TreeTutor stopped.', unavailable: 'Video unavailable: its saved file is missing or unreadable.' };

// The card is not a live region: only its status line announces, so progress ticks stay silent inside the chat log.
export default function VideoCard({ artifact, onAction }: { artifact: Artifact; onAction: (action: 'cancel' | 'retry') => Promise<void> }) {
  const id = useId();
  const [enlarged, setEnlarged] = useState(false);
  const media = `/api/trees/${artifact.conversation}/artifacts/${artifact.id}/media`;
  const state = artifact.status === 'pending' ? artifact.phase ?? 'preparing' : artifact.status === 'ready' && artifact.available === false ? 'unavailable' : artifact.status;
  const action = state === 'ready' ? null : artifact.status === 'pending' ? 'cancel' : 'retry';
  const progress = state === 'rendering' && typeof artifact.progress === 'number' ? Math.round(artifact.progress * 100) : undefined;
  return <section className="diagram-card" aria-live="off" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} data-artifact={artifact.id} data-state={state}>
    <VStack gap={3} padding={3}>
      <Heading level={3} id={`${id}-title`}>{artifact.title}</Heading>
      <Text id={`${id}-description`}>{artifact.description}</Text>
      <Text type="supporting" color="secondary" role="status" className={state === 'ready' ? 'sr-only' : undefined}><Text type="inherit" className="sr-only">{artifact.title}: </Text>{STATUS[state]}{state === 'failed' && artifact.error ? ` ${artifact.error}` : ''}</Text>
      {progress !== undefined && <ProgressBar label="Render progress" value={progress} hasValueLabel />}
      {/* One button element switches Cancel to Retry in place, so keyboard focus survives the state change. */}
      {action && <Button key="action" label={action === 'cancel' ? 'Cancel video' : state === 'unavailable' ? 'Regenerate video' : 'Retry video'} size="sm" clickAction={() => onAction(action)} />}
      {/* The frame keeps the player's size while pending, so completion does not shift the conversation. */}
      {state === 'ready' ? <>
        <video className="video-frame" src={media} controls preload="metadata" aria-label={`Video: ${artifact.title}`} aria-describedby={`${id}-description`} />
        <Button label="Open large" size="sm" clickAction={() => setEnlarged(true)} />
        <Lightbox isOpen={enlarged} onOpenChange={setEnlarged} hasAutoPlay media={{ src: media, alt: `Video: ${artifact.title}`, caption: artifact.title, type: 'video' }} />
      </>
        : artifact.status === 'pending' && <section className="video-frame" aria-hidden="true" />}
    </VStack>
  </section>;
}
