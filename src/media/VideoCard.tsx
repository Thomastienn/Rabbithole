import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  CheckIcon,
  FilmIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Lightbox } from '@astryxdesign/core/Lightbox';
import type { Artifact } from './artifacts';
import LivePlayer from './LivePlayer';
import VideoUsage from './VideoUsage';
import { STEPS, elapsed, estimateVideoProgress, videoStep, videoStepDetail } from './videoProgress';

const STATUS = {
  pending: 'Creating video…',
  ready: 'Video ready.',
  failed: 'Video could not be generated. Retry, or check Smart in Settings.',
  canceled: 'Video generation canceled.',
  interrupted: 'Video generation interrupted when Rabbithole stopped.',
  unavailable: 'Video unavailable: its saved file is missing or unreadable.',
};
const STEP_LABEL = {
  planning: 'Planning cuts',
  pieces: 'Writing set pieces',
  writing: 'Writing cuts',
  narrating: 'Recording narration',
  auditing: 'Auditing cuts',
  playable: 'Playing live',
  saving: 'Saving video file',
};
const CUT_STATE = {
  writing: 'Writing',
  narrating: 'Narrating',
  auditing: 'Auditing',
  fixing: 'Fixing',
  repairing: 'Repairing',
  ready: 'Ready',
};

// Only known server-authored reasons reach the learner; arbitrary worker errors may contain private output.
const FAILURE_REASON =
  /^(?:Video request could not be read: [^\n]+\.|Tutor reply did not complete\.|Video (?:rendering (?:failed|timed out)|renderer could not start|narration timed out|narration failed\. Check your connection and Retry|could not be saved|composition (?:timed out|did not complete|exceeds 64 KiB|is missing its (?:description|narration)|uses a disallowed import or resource)|provider failed to generate a composition|narration(?: timing)? is (?:missing|unreadable))\.|Rendered video is unreadable\.)$/;

// Rough storyboard panels drawn and erased in ink behind the progress (spec decision 9). Hand-set wobble keeps them sketched.
const SKETCH = [
  'M42 46 C96 43 158 45 206 48 C208 82 207 116 204 150 C150 152 96 151 44 148 C41 114 42 80 42 46',
  'M70 122 C92 96 112 92 130 104 S168 126 184 92',
  'M240 47 C300 44 362 46 404 45 C406 80 405 118 402 151 C342 153 290 150 241 149 C238 116 239 80 240 47',
  'M268 98 C290 76 330 76 346 98 C330 120 290 120 268 98 M374 98 L388 98',
  'M438 46 C494 44 552 47 600 45 C602 82 601 116 598 150 C540 152 490 151 440 149 C437 114 438 80 438 46',
  'M462 128 L488 86 L514 112 L540 72 L572 104',
];

// Only the status line announces (step changes, ready, failure); source stays private.
// Library cards pass their own media route and no onAction: their source conversation may be gone, so nothing can regenerate there.
export default function VideoCard({
  artifact,
  inline = false,
  onAction,
  media = `/api/trees/${artifact.conversation}/artifacts/${artifact.id}/media`,
  actions,
}: {
  artifact: Pick<
    Artifact,
    | 'id'
    | 'title'
    | 'description'
    | 'status'
    | 'available'
    | 'conversation'
    | 'phase'
    | 'progress'
    | 'characters'
    | 'frames'
    | 'cut'
    | 'cuts'
    | 'startedAt'
    | 'phaseStartedAt'
    | 'cutRows'
    | 'drawing'
  > & { error?: string | null };
  inline?: boolean;
  onAction?: (action: 'cancel' | 'retry' | 'regenerate') => Promise<void>;
  media?: string;
  actions?: ReactNode;
}) {
  const id = useId();
  const [enlarged, setEnlarged] = useState(false);
  const state =
    artifact.status === 'ready' && artifact.available === false ? 'unavailable' : artifact.status;
  const drafting = inline && state === 'pending';
  // Once cut 1 is ready the pending video plays live until its MP4 is saved.
  const live =
    state === 'pending' && (artifact.phase === 'playable' || artifact.phase === 'saving');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!drafting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [drafting]);
  // The bar never moves backward between polls; it resets when the job ends.
  const peak = useRef(0);
  peak.current = drafting ? Math.max(peak.current, estimateVideoProgress(artifact, now)) : 0;
  const step = videoStep(artifact),
    detail = videoStepDetail(artifact);
  const status = drafting
    ? `${STEP_LABEL[step]}…`
    : state === 'failed' && inline && FAILURE_REASON.test(artifact.error ?? '')
      ? artifact.error
      : STATUS[state];
  const caption = inline && (
    <VStack gap={1} className="video-caption">
      <Heading
        level={3}
        id={`${id}-title`}
        className={state === 'ready' || drafting ? undefined : 'sr-only'}
      >
        {artifact.title}
      </Heading>
      {artifact.description && state === 'ready' && (
        <Text id={`${id}-description`}>{artifact.description}</Text>
      )}
    </VStack>
  );
  const open = state === 'ready' && (
    <Button
      key="action"
      label="Open large"
      variant="ghost"
      size="sm"
      icon={<ArrowsPointingOutIcon />}
      aria-label={`Open large: ${artifact.title}`}
      clickAction={() => setEnlarged(true)}
    />
  );
  // Library cards (mockup Videos): frame first, then title, description and an action row that leads with Open large.
  return (
    <section
      className={`video-card ${inline ? 'video-inline' : 'video-volume'}`}
      tabIndex={inline ? -1 : undefined}
      aria-live="off"
      aria-labelledby={`${id}-title`}
      aria-describedby={artifact.description ? `${id}-description` : undefined}
      data-artifact={artifact.id}
      data-state={state}
      data-live={live || undefined}
    >
      <VStack gap={2}>
        <section
          className={`video-stage${!inline || state === 'ready' || drafting ? ' video-frame' : ''}`}
        >
          {state === 'pending' && !inline && !live && <Skeleton />}
          {live && (
            <LivePlayer
              conversation={artifact.conversation}
              id={artifact.id}
              title={artifact.title}
            />
          )}
          {live && drafting && (
            <span className="video-draft-bar" aria-hidden>
              <i style={{ transform: `scaleX(${peak.current})` }} />
            </span>
          )}
          {drafting && !live && (
            <div className="video-draft">
              <svg
                className="video-sketch"
                viewBox="0 0 640 360"
                preserveAspectRatio="xMidYMin meet"
                aria-hidden
              >
                {SKETCH.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    pathLength={1}
                    className={i % 2 ? 'video-sketch-mark' : undefined}
                    style={{ animationDelay: `${i * 0.6}s` }}
                  />
                ))}
              </svg>
              <ol className="video-steps">
                {STEPS.map((s, i) => {
                  const at = STEPS.indexOf(step);
                  return (
                    <li key={s} data-step={i < at ? 'done' : i === at ? 'active' : 'next'}>
                      {i < at ? <CheckIcon aria-hidden /> : <i aria-hidden />}
                      <span>{STEP_LABEL[s]}</span>
                      {i === at && detail && <small>{detail}</small>}
                    </li>
                  );
                })}
              </ol>
              <span className="video-draft-bar" aria-hidden>
                <i style={{ transform: `scaleX(${peak.current})` }} />
              </span>
            </div>
          )}
          {state === 'ready' && (
            <video
              className="video-frame"
              src={media}
              controls
              preload="metadata"
              aria-label={`Video: ${artifact.title}`}
              aria-describedby={`${id}-description`}
            />
          )}
          <VStack gap={2} padding={3} hAlign="center" vAlign="center" className="video-controls">
            {inline &&
              state !== 'ready' &&
              !drafting &&
              (state === 'failed' || state === 'unavailable' ? (
                <ExclamationTriangleIcon className="failure-icon" aria-hidden />
              ) : (
                <FilmIcon className="video-status-icon" aria-hidden />
              ))}
            <Text
              type="supporting"
              color="secondary"
              role="status"
              className={state === 'ready' || (drafting && !live) ? 'sr-only' : undefined}
            >
              <Text type="inherit" className="sr-only">
                {artifact.title}:{' '}
              </Text>
              {status}
            </Text>
            {state === 'ready' && onAction && (
              <IconButton
                label={`Try a different version of video: ${artifact.title}`}
                tooltip="Try a different version"
                icon={<ArrowPathIcon />}
                variant="ghost"
                size="sm"
                clickAction={() => onAction('regenerate')}
              />
            )}
            {/* Keep the action mounted so Cancel → Retry/Open large preserves keyboard focus. */}
            {drafting && (
              <time className="video-elapsed" aria-label="Elapsed">
                {elapsed(artifact, now)}
              </time>
            )}
            {inline && (state === 'ready' || onAction) && (
              <Button
                key="action"
                label={
                  state === 'ready'
                    ? 'Open large'
                    : state === 'pending'
                      ? 'Cancel video'
                      : state === 'unavailable'
                        ? 'Regenerate video'
                        : 'Retry video'
                }
                variant={state === 'failed' || state === 'unavailable' ? 'secondary' : 'ghost'}
                size="sm"
                clickAction={() =>
                  state === 'ready'
                    ? setEnlarged(true)
                    : onAction?.(state === 'pending' ? 'cancel' : 'retry')
                }
              />
            )}
          </VStack>
        </section>
        {drafting && (artifact.cutRows?.length || artifact.drawing) && (
          <ol className="video-cut-rows" aria-live="polite" aria-label="Cuts">
            {artifact.drawing && (
              <li data-state="drawing">
                <span>
                  Set pieces: {artifact.drawing.drawn} of {artifact.drawing.total} drawn
                </span>
                {artifact.drawing.drawing.length > 0 && (
                  <small>Drawing {artifact.drawing.drawing.join(', ')}</small>
                )}
              </li>
            )}
            {artifact.cutRows?.map((row) => (
              <li key={row.cut} data-state={row.state}>
                <span>
                  {row.cut}. {row.title}
                </span>
                <small>{CUT_STATE[row.state]}</small>
              </li>
            ))}
          </ol>
        )}
        {caption}
        {!inline && (
          <Heading level={3} id={`${id}-title`}>
            {artifact.title}
          </Heading>
        )}
        {!inline && (
          <Text id={`${id}-description`} color="secondary">
            {artifact.description}
          </Text>
        )}
        {!inline && (
          <HStack gap={1} wrap="wrap" className="video-volume-actions">
            {open}
            {actions}
          </HStack>
        )}
        {inline && state !== 'pending' && (
          <VideoUsage
            url={`/api/trees/${artifact.conversation}/artifacts/${artifact.id}/usage`}
            title={artifact.title}
          />
        )}
        {state === 'ready' && enlarged && (
          <Lightbox
            isOpen
            onOpenChange={setEnlarged}
            hasAutoPlay
            media={{
              src: media,
              alt: `Video: ${artifact.title}`,
              caption: artifact.title,
              type: 'video',
            }}
          />
        )}
      </VStack>
    </section>
  );
}
