// TreeTutor video kit: copied beside each generated composition as ./kit. Building blocks only, no scene templates.
// Fixed dark-paper identity (docs/video-quality-spec.md); inks are the Paperback dark series values.
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const palette = {
  ground: '#1a1613', raised: '#241e19', seam: '#efe6d61f', line: '#efe6d647',
  paper: '#efe6d6', muted: '#ab9e8b',
  amber: '#dfae4e', leaf: '#9dba6e', rust: '#d68560', lichen: '#86b8ae',
};
// Data series order after the amber primary.
export const series = [palette.amber, palette.leaf, palette.rust, palette.lichen];

export const fonts = { heading: 'Archivo, sans-serif', reading: 'Literata, Georgia, serif' };
export const type: Record<'title' | 'heading' | 'label' | 'caption' | 'reading', CSSProperties> = {
  title: { fontFamily: fonts.heading, fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.01em', color: palette.paper },
  heading: { fontFamily: fonts.heading, fontSize: 44, fontWeight: 600, lineHeight: 1.2, color: palette.paper },
  label: { fontFamily: fonts.heading, fontSize: 28, fontWeight: 500, lineHeight: 1.3, color: palette.paper },
  caption: { fontFamily: fonts.heading, fontSize: 22, fontWeight: 600, lineHeight: 1.3, letterSpacing: '0.08em', textTransform: 'uppercase', color: palette.muted },
  reading: { fontFamily: fonts.reading, fontSize: 32, fontWeight: 400, lineHeight: 1.45, color: palette.paper },
};

// 1280x720 frame; the bottom band belongs to app subtitles.
export const frame = { width: 1280, height: 720, margin: 80, top: 64, subtitles: 150 };

export const ease = Easing.bezier(0.22, 1, 0.36, 1);
// 0 to 1 over [start, start + duration] frames, eased and clamped.
export const progress = (f: number, start: number, duration = 18) =>
  interpolate(f, [start, start + duration], [0, 1], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
// Fade and rise in from below; spread onto any element's style.
export const enter = (f: number, start: number, { duration = 18, distance = 24 } = {}): CSSProperties => {
  const p = progress(f, start, duration);
  return { opacity: p, transform: `translateY(${(1 - p) * distance}px)` };
};
// Springy 0 to 1 for scale or emphasis.
export const pop = (f: number, fps: number, start: number) => spring({ frame: f - start, fps, config: { damping: 18, stiffness: 140 } });

// A scene that cross-fades in at `from` and out at `to` (frames, usually narration sentence bounds).
export function Scene({ from, to, fade = 12, children, style }: { from: number; to: number; fade?: number; children: ReactNode; style?: CSSProperties }) {
  const f = useCurrentFrame(), { durationInFrames } = useVideoConfig();
  if (f < from - fade || f > to + fade) return null;
  const hold = Math.max(from + 1, Math.min(to, durationInFrames - 1));
  const opacity = interpolate(f, [from - fade, from, hold, hold + fade], [0, 1, 1, to >= durationInFrames - 1 ? 1 : 0], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ padding: `${frame.top}px ${frame.margin}px ${frame.subtitles}px`, opacity, ...style }}>{children}</AbsoluteFill>;
}

// 3D presets for @remotion/three scenes.
export const three = {
  background: palette.ground,
  materials: { amber: palette.amber, leaf: palette.leaf, rust: palette.rust, lichen: palette.lichen, paper: palette.paper },
};
export const Lights = () => <>
  <ambientLight intensity={0.55} color="#fff4e2" />
  <directionalLight position={[4, 6, 5]} intensity={1.4} color="#fff1dc" />
  <directionalLight position={[-5, -2, -4]} intensity={0.35} color={palette.lichen} />
</>;
