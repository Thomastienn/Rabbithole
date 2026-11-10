import { useId } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import type { Artifact } from './artifacts';

const STATUS = { preparing: 'Preparing video…', rendering: 'Rendering video…', ready: 'Video ready.', failed: 'Video could not be generated.' };

// The card is not a live region: only its status line announces, so progress ticks stay silent inside the chat log.
export default function VideoCard({ artifact }: { artifact: Artifact }) {
  const id = useId();
  const state = artifact.status === 'pending' ? artifact.phase ?? 'preparing' : artifact.status;
  const progress = state === 'rendering' && typeof artifact.progress === 'number' ? Math.round(artifact.progress * 100) : undefined;
  return <section className="diagram-card" aria-live="off" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} data-artifact={artifact.id} data-state={state}>
    <VStack gap={3} padding={3}>
      <Heading level={3} id={`${id}-title`}>{artifact.title}</Heading>
      <Text id={`${id}-description`}>{artifact.description}</Text>
      <Text type="supporting" color="secondary" role="status" className={state === 'ready' ? 'sr-only' : undefined}><Text type="inherit" className="sr-only">{artifact.title}: </Text>{STATUS[state]}{state === 'failed' && artifact.error ? ` ${artifact.error}` : ''}</Text>
      {progress !== undefined && <ProgressBar label="Render progress" value={progress} hasValueLabel />}
      {/* The frame keeps the player's size while pending, so completion does not shift the conversation. */}
      {state === 'ready' ? <video className="video-frame" src={`/api/trees/${artifact.conversation}/artifacts/${artifact.id}/media`} controls preload="metadata" aria-label={`Video: ${artifact.title}`} aria-describedby={`${id}-description`} />
        : state !== 'failed' && <section className="video-frame" aria-hidden="true" />}
    </VStack>
  </section>;
}
