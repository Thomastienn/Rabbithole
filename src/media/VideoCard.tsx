import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { ArrowPathIcon, FilmIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';
import { Lightbox } from '@astryxdesign/core/Lightbox';
import type { Artifact } from './artifacts';
import LivePlayer from './LivePlayer';
import ExportButton from './ExportButton';
import VideoUsage from './VideoUsage';
import { useNewVersion } from './NewVersion';
import { clock, elapsed, estimateVideoProgress, videoStep, videoStepDetail } from './videoProgress';

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
    failed: 'Failed',
};

// Only known server-authored reasons reach the learner; arbitrary worker errors may contain private output.
const FAILURE_REASON =
    /^(?:Video provider failed: [^\n]+|Video request could not be read: [^\n]+\.|Tutor reply did not complete\.|Video (?:rendering (?:failed|timed out)|renderer could not start|narration timed out|narration failed\. Check your connection and Retry|could not be saved|generation ran over two hours|composition (?:timed out|did not complete|exceeds 64 KiB|is missing its (?:description|narration)|uses a disallowed import or resource)|provider failed to generate a composition|narration(?: timing)? is (?:missing|unreadable))\.|Rendered video is unreadable\.)$/;

const DOWNLOADING =
    /^(?:Video tools are still downloading \(\d{1,3}%\)|Video tools aren't installed \(about \d+ MB\)|Video making needs the Windows sandbox\. Enable it in Settings, then ask again)\.$/;

// Rough storyboard panels drawn once in ink behind the progress (spec decision 9). Hand-set wobble keeps them sketched.
const SKETCH = [
    'M42 46 C96 43 158 45 206 48 C208 82 207 116 204 150 C150 152 96 151 44 148 C41 114 42 80 42 46',
    'M70 122 C92 96 112 92 130 104 S168 126 184 92',
    'M240 47 C300 44 362 46 404 45 C406 80 405 118 402 151 C342 153 290 150 241 149 C238 116 239 80 240 47',
    'M268 98 C290 76 330 76 346 98 C330 120 290 120 268 98 M374 98 L388 98',
    'M438 46 C494 44 552 47 600 45 C602 82 601 116 598 150 C540 152 490 151 440 149 C437 114 438 80 438 46',
    'M462 128 L488 86 L514 112 L540 72 L572 104',
];

// Only the status line announces (step changes, ready, failure); source stays private.
// Library cards pass their own media and cut routes and no onAction: their source conversation may be gone, so nothing can regenerate there.
export default function VideoCard({
    artifact,
    inline = false,
    onAction,
    media = `/api/trees/${artifact.conversation}/artifacts/${artifact.id}/media`,
    cuts = `/api/trees/${artifact.conversation}/artifacts/${artifact.id}/cuts`,
    actions,
    onExported,
    origin,
    duration,
}: {
    artifact: Pick<
        Artifact,
        | 'id'
        | 'title'
        | 'description'
        | 'status'
        | 'available'
        | 'exported'
        | 'conversation'
        | 'phase'
        | 'progress'
        | 'characters'
        | 'frames'
        | 'cut'
        | 'cuts'
        | 'startedAt'
        | 'phaseStartedAt'
        | 'started'
        | 'playableAt'
        | 'cutRows'
        | 'drawing'
        | 'hasPrevious'
    > & { error?: string | null };
    inline?: boolean;
    onAction?: (
        action: 'cancel' | 'retry' | 'regenerate' | 'install' | 'previous',
        instruction?: string,
    ) => Promise<void>;
    media?: string;
    cuts?: string;
    actions?: ReactNode;
    onExported?: () => void;
    // Library cards only: the source conversation's title (null once it is gone) and the length in seconds.
    origin?: string | null;
    duration?: number | null;
}) {
    const id = useId();
    const [enlarged, setEnlarged] = useState(false);
    // A request made without its tools, or before the Windows sandbox is set up, is saved as failed and shown unavailable with that reason.
    const downloading =
        artifact.status === 'failed' && DOWNLOADING.test(artifact.error ?? '')
            ? artifact.error
            : null;
    const missing = downloading?.startsWith('Video tools aren');
    const state =
        (artifact.status === 'ready' && artifact.available === false) || downloading
            ? 'unavailable'
            : artifact.status;
    const drafting = inline && state === 'pending';
    // Once cut 1 is ready the pending video plays live; a saved video plays live until it is exported.
    const live =
        state === 'pending' && (artifact.phase === 'playable' || artifact.phase === 'saving');
    const exported = state === 'ready' && artifact.exported !== false;
    const stage = useRef<HTMLElement>(null);
    // A library video rests behind one Play button; native controls appear once it starts.
    const player = useRef<HTMLVideoElement>(null);
    const [started, setStarted] = useState(inline);
    // The live player has no Lightbox form, so Open large shows its stage, with Export MP4, full screen.
    const enlarge = () =>
        exported ? setEnlarged(true) : void stage.current?.requestFullscreen().catch(() => {});
    const exportButton = state === 'ready' && (
        <ExportButton id={artifact.id} title={artifact.title} onExported={onExported} />
    );
    const versions = useNewVersion(
        artifact.hasPrevious,
        onAction && state === 'ready'
            ? (instruction) => onAction('regenerate', instruction)
            : undefined,
        onAction && state !== 'pending' ? () => onAction('previous') : undefined,
    );
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
        : downloading ||
          (state === 'failed' && inline && FAILURE_REASON.test(artifact.error ?? '')
              ? artifact.error
              : STATUS[state]);
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
            aria-label={`Open large: ${artifact.title}`}
            clickAction={enlarge}
        />
    );
    // Library cards (mockup Videos): frame first, then title, origin, description and one action row that leads with Open large.
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
                    ref={stage}
                    className={`video-stage${!inline || state === 'ready' || drafting ? ' video-frame' : ''}`}
                >
                    {state === 'pending' && !inline && !live && <Skeleton />}
                    {(live || (state === 'ready' && !exported)) && (
                        <LivePlayer cuts={cuts} title={artifact.title} pending={live} />
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
                                        style={{ animationDelay: `${i * 0.15}s` }}
                                    />
                                ))}
                            </svg>
                            <span className="video-draft-bar" aria-hidden>
                                <i style={{ transform: `scaleX(${peak.current})` }} />
                            </span>
                        </div>
                    )}
                    {exported && (
                        <video
                            ref={player}
                            className="video-frame"
                            src={media}
                            controls={started}
                            preload="metadata"
                            aria-label={`Video: ${artifact.title}`}
                            aria-describedby={`${id}-description`}
                            onPlay={() => setStarted(true)}
                        />
                    )}
                    {exported && !started && (
                        <>
                            <IconButton
                                className="video-play"
                                label={`Play ${artifact.title}`}
                                icon={<PlayIcon />}
                                variant="primary"
                                clickAction={() => {
                                    // Controls come up now, not on the async play event, so the video is focusable when the button leaves.
                                    setStarted(true);
                                    void player.current?.play();
                                    requestAnimationFrame(() => player.current?.focus());
                                }}
                            />
                            {duration != null && (
                                <span className="video-duration" aria-hidden>
                                    {clock(duration)}
                                </span>
                            )}
                        </>
                    )}
                    <VStack
                        gap={2}
                        padding={3}
                        hAlign="center"
                        vAlign="center"
                        className="video-controls"
                    >
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
                            className={state === 'ready' ? 'sr-only' : undefined}
                        >
                            <Text type="inherit" className="sr-only">
                                {artifact.title}:{' '}
                            </Text>
                            {status}
                        </Text>
                        {drafting && !live && detail && (
                            <small className="video-step-detail">{detail}</small>
                        )}
                        {inline && exportButton}
                        {versions.items.length > 0 && (
                            <DropdownMenu
                                presentation="popover"
                                alignment="end"
                                renderTrigger={(props) => (
                                    <IconButton
                                        {...props}
                                        label={`Video versions: ${artifact.title}`}
                                        tooltip="Versions"
                                        icon={<ArrowPathIcon />}
                                        variant="ghost"
                                        size="sm"
                                    />
                                )}
                                items={versions.items}
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
                                          : missing
                                            ? 'Install video tools'
                                            : state === 'unavailable' && !downloading
                                              ? 'Regenerate video'
                                              : 'Retry video'
                                }
                                variant={
                                    state === 'failed' || state === 'unavailable'
                                        ? 'secondary'
                                        : 'ghost'
                                }
                                size="sm"
                                clickAction={() =>
                                    state === 'ready'
                                        ? enlarge()
                                        : onAction?.(
                                              state === 'pending'
                                                  ? 'cancel'
                                                  : missing
                                                    ? 'install'
                                                    : 'retry',
                                          )
                                }
                            />
                        )}
                    </VStack>
                </section>
                {versions.box}
                {drafting && (artifact.cutRows?.length || artifact.drawing) && (
                    <ol className="video-cut-rows" aria-live="polite" aria-label="Cuts">
                        {artifact.drawing && (
                            <li data-state="drawing">
                                <span>
                                    Set pieces: {artifact.drawing.drawn} of {artifact.drawing.total}{' '}
                                    drawn
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
                    <VStack className="video-volume-caption">
                        <Heading level={3} id={`${id}-title`}>
                            {artifact.title}
                        </Heading>
                        <Text color="secondary" className="video-origin">
                            {origin ?? 'No longer in a conversation'}
                        </Text>
                        <Text id={`${id}-description`} color="secondary">
                            {artifact.description}
                        </Text>
                    </VStack>
                )}
                {!inline && (
                    <HStack className="video-volume-actions">
                        {open}
                        {/* No export over a library frame: an exported video exports from Open large, an unexported one here. */}
                        {!exported && exportButton}
                        {actions}
                    </HStack>
                )}
                {inline && state !== 'pending' && (
                    <VideoUsage
                        url={`/api/trees/${artifact.conversation}/artifacts/${artifact.id}/usage`}
                        title={artifact.title}
                        made={
                            artifact.started && artifact.playableAt
                                ? artifact.playableAt - artifact.started
                                : null
                        }
                    />
                )}
                {exported && enlarged && (
                    <Lightbox
                        isOpen
                        onOpenChange={setEnlarged}
                        hasAutoPlay
                        media={{
                            src: media,
                            alt: `Video: ${artifact.title}`,
                            caption: (
                                <span className="video-lightbox-caption">
                                    {artifact.title}
                                    {exportButton}
                                </span>
                            ),
                            type: 'video',
                        }}
                    />
                )}
            </VStack>
        </section>
    );
}
