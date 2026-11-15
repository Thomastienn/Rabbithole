// The live video composition: cuts in order, each with the same ground, join, narration and subtitles as the
// rendered cut (CUT_ENTRY in server/media/video-cut.mjs); an unready cut holds playback in a buffering state.
import { Component, useEffect, type ComponentType, type ReactNode } from 'react';
import {
  AbsoluteFill,
  Audio,
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
  } | null;
  emphasis?: Mark[];
  Component?: ComponentType<{ sentences: Sentence[]; durationInFrames: number }>;
  audio?: string;
  clip?: string;
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

export function Buffering() {
  const buffer = useBufferState();
  useEffect(() => {
    const handle = buffer.delayPlayback();
    return () => handle.unblock();
  }, []);
  return (
    <AbsoluteFill
      data-buffering
      style={{
        background: palette.ground,
        color: palette.muted,
        alignItems: 'center',
        justifyContent: 'center',
        font: `500 36px ${fonts.heading}`,
      }}
    >
      Loading the next cut…
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
            Cut && <Cut sentences={timing.sentences} durationInFrames={timing.durationInFrames} />
          )}
        </Contained>
        <Sketch marks={cut.emphasis} sentences={timing.sentences} />
        <Cursor marks={cut.emphasis} sentences={timing.sentences} />
      </Joined>
      <Audio src={cut.audio!} />
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
          {ready(cut) ? <Narrated cut={cut} /> : <Buffering />}
        </Series.Sequence>
      ))}
    </Series>
  );
}
