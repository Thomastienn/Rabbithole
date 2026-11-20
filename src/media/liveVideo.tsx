// The live video composition: cuts in order, each with the same ground, join, narration and subtitles as the
// rendered cut (CUT_ENTRY in server/media/video-cut.mjs); an unready cut holds playback on the previous cut's
// last frame until it is ready.
import { Component, useEffect, type ComponentType, type ReactNode } from 'react';
import {
  AbsoluteFill,
  Audio,
  Freeze,
  Sequence,
  Series,
  Video,
  interpolate,
  useBufferState,
  useCurrentFrame,
} from 'remotion';
import {
  Cursor,
  Joined,
  Sketch,
  fonts,
  frame as videoFrame,
  palette,
  type Join,
  type Mark,
  type TargetMark,
} from '../../server/media/video-kit';

type Caption = { text: string; startFrame: number; endFrame: number };
type Sentence = { startFrame: number; endFrame: number };
export type LiveCut = {
  playable: boolean;
  timing: {
    durationInFrames: number;
    audioFrames: number;
    transitionIn?: boolean;
    entry?: Join | null;
    exit?: Join | null;
    sentences: Sentence[];
    captions: Caption[];
    // The narration pause where a clip with sound plays.
    pause?: { id: string; startFrame: number; frames: number };
  } | null;
  emphasis?: (Mark | TargetMark)[];
  Component?: ComponentType<{
    sentences: Sentence[];
    durationInFrames: number;
    emphasis: (Mark | TargetMark)[];
  }>;
  audio?: string;
  clip?: string;
  // The clip-with-sound exhibit's URL, played during timing.pause.
  sound?: string;
};

// shortcut: a cut without measured narration holds 3 seconds, so later cuts shift once it is timed.
const PLACEHOLDER = 90;
export const liveDuration = (cuts: LiveCut[]) =>
  Math.max(
    1,
    cuts.reduce((n, c) => n + (c.timing?.durationInFrames ?? PLACEHOLDER), 0),
  );
const ready = (cut: LiveCut) =>
  cut.playable && !!cut.timing && !!cut.audio && !!(cut.Component || cut.clip);

// Holds the timeline (the Player resumes by itself once the cut is ready and this unmounts) over the previous
// cut's frozen last frame, with a corner mark announced once as it mounts.
export function Buffering({ previous }: { previous?: LiveCut }) {
  const buffer = useBufferState();
  useEffect(() => {
    const handle = buffer.delayPlayback();
    return () => handle.unblock();
  }, []);
  return (
    <AbsoluteFill data-buffering style={{ background: palette.ground }}>
      {previous && ready(previous) && (
        <Freeze frame={previous.timing!.durationInFrames - 1}>
          <Narrated cut={previous} />
        </Freeze>
      )}
      <div
        role="status"
        style={{
          position: 'absolute',
          top: 32,
          right: 40,
          padding: '6px 16px',
          background: `${palette.ground}cc`,
          color: palette.muted,
          font: `500 24px ${fonts.heading}`,
        }}
      >
        Loading the next cut…
      </div>
    </AbsoluteFill>
  );
}

// Model-written code that throws shows the bare ground; the saved MP4 replaces the live version later.
class Contained extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Narrated({ cut }: { cut: LiveCut }) {
  const frame = useCurrentFrame(),
    timing = cut.timing!;
  const caption = timing.captions.find((c) => frame >= c.startFrame && frame < c.endFrame);
  const opacity = caption
    ? Math.min(
        interpolate(frame, [caption.startFrame, caption.startFrame + 5], [0, 1], {
          extrapolateRight: 'clamp',
        }),
        interpolate(frame, [caption.endFrame - 4, caption.endFrame], [1, 0], {
          extrapolateLeft: 'clamp',
        }),
      )
    : 0;
  const Cut = cut.Component;
  return (
    <AbsoluteFill
      style={{ background: palette.ground, color: palette.paper, fontFamily: fonts.heading }}
    >
      <Joined timing={timing}>
        <Contained>
          {cut.clip ? (
            <AbsoluteFill style={{ clipPath: 'inset(64px 80px 120px)' }}>
              <Video src={cut.clip} muted style={{ width: '100%', height: '100%' }} />
            </AbsoluteFill>
          ) : (
            Cut && (
              <Cut
                sentences={timing.sentences}
                durationInFrames={timing.durationInFrames}
                emphasis={cut.emphasis ?? []}
              />
            )
          )}
        </Contained>
        <Sketch marks={cut.emphasis} sentences={timing.sentences} />
        <Cursor marks={cut.emphasis} sentences={timing.sentences} />
      </Joined>
      <Audio src={cut.audio!} />
      {timing.pause && cut.sound && (
        <Sequence
          from={timing.pause.startFrame}
          durationInFrames={timing.pause.frames}
          layout="none"
        >
          <Audio src={cut.sound} />
        </Sequence>
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: videoFrame.subtitles,
          background: `linear-gradient(to top, ${palette.ground}f0 0%, ${palette.ground}cc 55%, ${palette.ground}00 100%)`,
          pointerEvents: 'none',
        }}
      />
      {caption && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 120,
            right: 120,
            textAlign: 'center',
            fontFamily: fonts.heading,
            fontWeight: 500,
            fontSize: 40,
            lineHeight: 1.2,
            color: palette.paper,
            opacity,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {caption.text}
        </div>
      )}
    </AbsoluteFill>
  );
}

export default function LiveVideo({ cuts }: { cuts: LiveCut[] }) {
  return (
    <Series>
      {cuts.map((cut, i) => (
        <Series.Sequence key={i} durationInFrames={cut.timing?.durationInFrames ?? PLACEHOLDER}>
          {ready(cut) ? <Narrated cut={cut} /> : <Buffering previous={cuts[i - 1]} />}
        </Series.Sequence>
      ))}
    </Series>
  );
}
