// Rabbithole video kit: copied beside each generated composition as ./kit. Building blocks only, no scene templates.
// Fixed dark-paper identity (docs/video-quality-spec.md); inks are the Paperback dark series values.
import type { CSSProperties, ReactNode } from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { flip } from '@remotion/transitions/flip';
import { clockWipe } from '@remotion/transitions/clock-wipe';
import { iris } from '@remotion/transitions/iris';
export {
  setStock,
  Exhibit,
  Camera,
  cameraAt,
  screenAt,
  Pin,
  Copies,
  Lights,
  type CameraKey,
} from './video-stock';

export const palette = {
  ground: '#1a1613',
  raised: '#241e19',
  seam: '#efe6d61f',
  line: '#efe6d647',
  paper: '#efe6d6',
  muted: '#ab9e8b',
  amber: '#dfae4e',
  leaf: '#9dba6e',
  rust: '#d68560',
  lichen: '#86b8ae',
};
// Data series order after the amber primary.
export const series = [palette.amber, palette.leaf, palette.rust, palette.lichen];

export const fonts = { heading: 'Archivo, sans-serif', reading: 'Literata, Georgia, serif' };
export const type: Record<'title' | 'heading' | 'label' | 'caption' | 'reading', CSSProperties> = {
  title: {
    fontFamily: fonts.heading,
    fontSize: 64,
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: '-0.01em',
    color: palette.paper,
  },
  heading: {
    fontFamily: fonts.heading,
    fontSize: 44,
    fontWeight: 600,
    lineHeight: 1.2,
    color: palette.paper,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 28,
    fontWeight: 500,
    lineHeight: 1.3,
    color: palette.paper,
  },
  caption: {
    fontFamily: fonts.heading,
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: palette.muted,
  },
  reading: {
    fontFamily: fonts.reading,
    fontSize: 32,
    fontWeight: 400,
    lineHeight: 1.45,
    color: palette.paper,
  },
};

// 1920x1080 frame; the bottom band belongs to app subtitles.
export const frame = { width: 1920, height: 1080, margin: 80, top: 64, subtitles: 120 };

export const ease = Easing.bezier(0.22, 1, 0.36, 1);
// 0 to 1 over [start, start + duration] frames, eased and clamped.
export const progress = (f: number, start: number, duration = 18) =>
  interpolate(f, [start, start + duration], [0, 1], {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
// Fade and rise in from below; spread onto any element's style.
export const enter = (
  f: number,
  start: number,
  { duration = 18, distance = 24 } = {},
): CSSProperties => {
  const p = progress(f, start, duration);
  return { opacity: p, transform: `translateY(${(1 - p) * distance}px)` };
};
// Springy 0 to 1 for scale or emphasis.
export const pop = (f: number, fps: number, start: number) =>
  spring({ frame: f - start, fps, config: { damping: 18, stiffness: 140 } });

// A scene that cross-fades in at `from` and out at `to` (frames, usually narration sentence bounds).
export function Scene({
  from,
  to,
  fade = 12,
  children,
  style,
}: {
  from: number;
  to: number;
  fade?: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const f = useCurrentFrame(),
    { durationInFrames } = useVideoConfig();
  if (f < from - fade || f > to + fade) return null;
  const hold = Math.max(from + 1, Math.min(to, durationInFrames - 1));
  const opacity = interpolate(
    f,
    [from - fade, from, hold, hold + fade],
    [0, 1, 1, to >= durationInFrames - 1 ? 1 : 0],
    { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return (
    <AbsoluteFill
      style={{
        padding: `${frame.top}px ${frame.margin}px ${frame.subtitles}px`,
        opacity,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

// 3D presets for @remotion/three scenes.
export const three = {
  background: palette.ground,
  materials: {
    amber: palette.amber,
    leaf: palette.leaf,
    rust: palette.rust,
    lichen: palette.lichen,
    paper: palette.paper,
  },
};
// Emphasis overlay: the app draws these above every cut (Manim included) from the plan's cut.emphasis marks,
// timed to narration sentence frames, in the shared 1920x1080 frame space.
type Timed = { startFrame: number; endFrame: number };
type Point = [number, number];
export type Mark =
  | { tool: 'cursor'; sentence: number; x: number; y: number; label?: string }
  | {
      tool: 'sketch';
      shape: 'circle' | 'underline' | 'arrow' | 'freehand';
      sentence: number;
      points: Point[];
    };
const GLIDE = 15,
  DRAW = 20,
  FADE = 10;
const drawDuration = (s: Timed) => Math.max(1, Math.min(DRAW, s.endFrame - s.startFrame));

// Cursor position, visibility and label at frame f: it glides to each target as its sentence starts,
// shows that target's label once it arrives, and fades after the last target's sentence ends.
export function cursorAt(marks: Mark[], sentences: Timed[], f: number) {
  const stops = marks
    .flatMap((m) =>
      m.tool === 'cursor' && sentences[m.sentence]
        ? [{ ...m, start: sentences[m.sentence].startFrame, end: sentences[m.sentence].endFrame }]
        : [],
    )
    .sort((a, b) => a.start - b.start);
  if (!stops.length) return null;
  const i = Math.max(0, stops.filter((s) => f >= s.start).length - 1),
    stop = stops[i],
    from = stops[i - 1] ?? stop,
    t = progress(f, stop.start, GLIDE);
  return {
    x: from.x + (stop.x - from.x) * t,
    y: from.y + (stop.y - from.y) * t,
    opacity: progress(f, stops[0].start - FADE, FADE) * (1 - progress(f, stops.at(-1)!.end, FADE)),
    label: stop.label,
    labelOpacity: progress(f, stop.start + GLIDE, 8) * (1 - progress(f, stop.end, 8)),
  };
}

// Sketch stroke progress (0 to 1 drawn) and opacity at frame f: drawn as its sentence starts, faded as it ends.
export function sketchAt(mark: Mark, sentences: Timed[], f: number) {
  const s = sentences[mark.sentence];
  if (!s || f < s.startFrame) return { draw: 0, opacity: 0 };
  return {
    draw: progress(f, s.startFrame, drawDuration(s)),
    opacity: 1 - progress(f, s.endFrame, FADE),
  };
}

// Hand-drawn wobble, deterministic per mark so every frame and render draws the same stroke.
function sketchPoints(mark: Extract<Mark, { tool: 'sketch' }>) {
  const seed = mark.points.flat().reduce((n, v) => n + v, 0);
  const wobble = (i: number, k: number) => Math.sin(seed * 12.9898 + i * 78.233) * k;
  const [[ax, ay], [bx, by]] = mark.points;
  let pts: Point[] = [];
  if (mark.shape === 'circle') {
    const cx = (ax + bx) / 2,
      cy = (ay + by) / 2,
      rx = Math.abs(bx - ax) / 2 + 18,
      ry = Math.abs(by - ay) / 2 + 18;
    // A hand circle overshoots its start a little.
    for (let i = 0; i <= 48; i++) {
      const a = -2.2 + (i / 48) * (Math.PI * 2 + 0.45),
        r = 1 + wobble(i, 0.035);
      pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
    }
  } else if (mark.shape === 'freehand') {
    pts = mark.points.map(([x, y], i) => [x + wobble(i, 3), y + wobble(i + 7, 3)]);
  } else {
    const n = 16,
      bow = mark.shape === 'arrow' ? 0.08 : 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n,
        arc = Math.sin(t * Math.PI) * bow;
      pts.push([
        ax + (bx - ax) * t - (by - ay) * arc + wobble(i, 2.5),
        ay + (by - ay) * t + (bx - ax) * arc + wobble(i + 3, 2.5),
      ]);
    }
  }
  if (mark.shape === 'arrow') {
    const [px, py] = pts.at(-3)!,
      angle = Math.atan2(by - py, bx - px);
    const head = (turn: number): Point => [
      bx - Math.cos(angle + turn) * 34,
      by - Math.sin(angle + turn) * 34,
    ];
    // One continuous stroke lets the pen draw the shaft before the arrowhead.
    pts.push([bx, by], head(0.5), [bx, by], head(-0.5));
  }
  return pts.map(([x, y]): Point => [Number(x.toFixed(1)), Number(y.toFixed(1))]);
}
export function sketchPath(mark: Extract<Mark, { tool: 'sketch' }>) {
  return (
    'M' +
    sketchPoints(mark)
      .map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' L')
  );
}

// Match SVG dash progress by arc length, then lift the nib away over eight frames.
export function penAt(
  mark: Extract<Mark, { tool: 'sketch' }>,
  sentences: Timed[],
  f: number,
  reduced = false,
) {
  const s = sentences[mark.sentence];
  if (reduced || !s || f < s.startFrame) return null;
  const lift = progress(f, s.startFrame + drawDuration(s), 8);
  if (lift >= 1) return null;
  const { draw, opacity } = sketchAt(mark, sentences, f),
    pts = sketchPoints(mark);
  const lengths = pts.slice(1).map(([x, y], i) => Math.hypot(x - pts[i][0], y - pts[i][1]));
  let remaining = draw * lengths.reduce((a, b) => a + b, 0),
    i = 0;
  while (i < lengths.length - 1 && remaining > lengths[i]) remaining -= lengths[i++];
  const [x, y] = pts[i],
    [bx, by] = pts[i + 1],
    t = lengths[i] ? remaining / lengths[i] : 0;
  return {
    x: x + (bx - x) * t + lift * 12,
    y: y + (by - y) * t - lift * 24,
    opacity: opacity * (1 - lift),
  };
}

export function Sketch({ marks = [], sentences }: { marks?: Mark[]; sentences: Timed[] }) {
  const f = useCurrentFrame();
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <svg
      width={frame.width}
      height={frame.height}
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {marks.map((mark, i) => {
        if (mark.tool !== 'sketch') return null;
        const { draw, opacity } = sketchAt(mark, sentences, f);
        const tip = penAt(mark, sentences, f, reduced);
        return opacity > 0 ? (
          <g key={i}>
            <path
              d={sketchPath(mark)}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - draw}
              fill="none"
              stroke={palette.amber}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={opacity}
            />
            {tip && (
              <g data-pen-tip transform={`translate(${tip.x} ${tip.y})`} opacity={tip.opacity}>
                <path
                  d="M0 0 L4 -16 L29 -41 Q34 -46 39 -41 L43 -37 Q48 -32 43 -27 L18 -2 Z"
                  fill={palette.paper}
                  stroke={palette.ground}
                  strokeWidth={3}
                  strokeLinejoin="round"
                />
                <path d="M0 0 L4 -16 L18 -2 Z" fill={palette.amber} />
              </g>
            )}
          </g>
        ) : null;
      })}
    </svg>
  );
}

export function Cursor({ marks = [], sentences }: { marks?: Mark[]; sentences: Timed[] }) {
  const at = cursorAt(marks, sentences, useCurrentFrame());
  if (!at || at.opacity <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: at.x,
        top: at.y,
        opacity: at.opacity,
        pointerEvents: 'none',
      }}
    >
      <svg
        width={40}
        height={48}
        viewBox="0 0 40 48"
        style={{ position: 'absolute', left: -4, top: -3 }}
      >
        <path
          d="M4 3 L4 40 L14 30 L21 45 L28 42 L21 27 L35 27 Z"
          fill={palette.paper}
          stroke={palette.ground}
          strokeWidth={3}
          strokeLinejoin="round"
        />
      </svg>
      {at.label && at.labelOpacity > 0 && (
        <div
          style={{
            ...type.label,
            position: 'absolute',
            left: 36,
            top: 40,
            whiteSpace: 'nowrap',
            padding: '8px 18px',
            borderRadius: 14,
            background: palette.raised,
            border: `2px solid ${palette.line}`,
            opacity: at.labelOpacity,
          }}
        >
          {at.label}
        </div>
      )}
    </div>
  );
}

// Joins between cuts (docs/video-consistency-spec.md). A continuing cut is a hard cut; a scene change plays one
// side of its transition per cut: the outgoing cut exits over its closing pause, then the next cut enters.
export type Join =
  | { join: 'continue' }
  | {
      join: 'scene';
      transition?: 'fade' | 'slide' | 'wipe' | 'flip' | 'clockWipe' | 'iris';
      direction?: string;
    };
type JoinTiming = {
  durationInFrames: number;
  audioFrames: number;
  transitionIn?: boolean;
  entry?: Join | null;
  exit?: Join | null;
};
const SHORT_FADE: Join = { join: 'scene', transition: 'fade' };
const side = (join: Join | null, reduced: boolean) => {
  if (join?.join !== 'scene') return null;
  const transition = reduced ? 'fade' : (join.transition ?? 'fade');
  return { transition, direction: transition === 'fade' ? undefined : join.direction };
};
// Entering progress runs 0 to 1 over the cut's first frames, exiting progress 0 to 1 over its closing pause.
export function joinAt(timing: JoinTiming, f: number, reduced = false) {
  // Timings saved before joins only record whether the cut faded in; every cut faded out.
  const entry = side(
    timing.entry === undefined ? (timing.transitionIn ? SHORT_FADE : null) : timing.entry,
    reduced,
  );
  const exit = side(timing.exit === undefined ? SHORT_FADE : timing.exit, reduced);
  return {
    entry: entry && {
      ...entry,
      progress: progress(f, 0, entry.transition === 'fade' ? 8 : 15),
    },
    exit: exit && {
      ...exit,
      progress: progress(f, timing.audioFrames, timing.durationInFrames - timing.audioFrames),
    },
  };
}

type Side = NonNullable<ReturnType<typeof joinAt>['entry']>;
const presentation = ({ transition, direction }: Side) => {
  const options = { direction: direction as never };
  const size = { width: frame.width, height: frame.height };
  return (
    {
      fade: () => fade({ shouldFadeOutExitingScene: true }),
      slide: () => slide(options),
      wipe: () => wipe(options),
      flip: () => flip(options),
      clockWipe: () => clockWipe(size),
      iris: () => iris(size),
    } as Record<string, () => { component: any; props: Record<string, unknown> }>
  )[transition]();
};
// The presentation stays the same for the whole cut, so the cut underneath never remounts.
function Played({
  at,
  exiting,
  children,
}: {
  at: Side | null;
  exiting: boolean;
  children: ReactNode;
}) {
  if (!at) return <>{children}</>;
  const { component: Presentation, props } = presentation(at);
  // Clock wipe and iris leave their exiting side untouched, so the outgoing cut plays the entering side in reverse.
  const reverse = exiting && (at.transition === 'clockWipe' || at.transition === 'iris');
  return (
    <Presentation
      presentationDirection={exiting && !reverse ? 'exiting' : 'entering'}
      presentationProgress={reverse ? 1 - at.progress : at.progress}
      passedProps={props}
      presentationDurationInFrames={15}
      onElementImage={() => {}}
      onUnmount={() => {}}
      bothEnteringAndExiting={false}
    >
      {children}
    </Presentation>
  );
}
export function Joined({ timing, children }: { timing: JoinTiming; children: ReactNode }) {
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { entry, exit } = joinAt(timing, useCurrentFrame(), reduced);
  return (
    <Played at={entry} exiting={false}>
      <Played at={exit} exiting>
        {children}
      </Played>
    </Played>
  );
}
