// Runs inside the live video frame: opaque origin (sandbox="allow-scripts" only) with its own CSP, so cut code
// cannot reach app storage, DOM, cookies or the network. Only the kit and libraries below are available to it.
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { Player } from '@remotion/player';
import * as remotion from 'remotion';
import * as three from 'three';
import * as fiber from '@react-three/fiber';
import * as remotionThree from '@remotion/three';
import * as kit from '../../server/media/video-kit';
import LiveVideo, { liveDuration, type LiveCut } from './liveVideo';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '@fontsource/literata/400.css';
import '@fontsource/literata/600.css';

type Incoming = Omit<LiveCut, 'Component' | 'audio' | 'clip'> & {
  code: string | null;
  audio?: Blob;
  clip?: Blob;
};
const libraries: Record<string, unknown> = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  remotion,
  three,
  '@react-three/fiber': fiber,
  '@remotion/three': remotionThree,
};
const loaded: { code?: string; Component?: LiveCut['Component']; audio?: string; clip?: string }[] =
  [];
let pieces: { code?: string; exports?: unknown } = {};

// The server compiled each cut to a CommonJS body; an inline script (allowed by this frame's CSP) defines it.
function compile(code: string, colors: Record<string, string>) {
  return load(code, colors)?.default as LiveCut['Component'] | undefined;
}
function load(code: string, colors: Record<string, string>) {
  let factory: ((...args: unknown[]) => void) | undefined;
  Object.assign(window, { __cut: (f: typeof factory) => (factory = f) });
  const script = document.createElement('script');
  script.textContent = `__cut(function (require, module, exports) {\n${code}\n})`;
  document.head.append(script);
  script.remove();
  const module = { exports: {} as Record<string, unknown> };
  try {
    factory?.(
      (name: string) => {
        if (name === './kit') return { ...kit, colors };
        if (name === './pieces' && pieces.exports) return pieces.exports;
        if (name in libraries) return libraries[name];
        throw new Error(`Cut import is outside the kit: ${name}`);
      },
      module,
      module.exports,
    );
  } catch {
    return undefined;
  }
  return module.exports;
}

const root = createRoot(document.getElementById('player')!);
function show(cuts: LiveCut[]) {
  root.render(
    <Player
      component={LiveVideo}
      inputProps={{ cuts }}
      durationInFrames={liveDuration(cuts)}
      compositionWidth={kit.frame.width}
      compositionHeight={kit.frame.height}
      fps={30}
      controls
      acknowledgeRemotionLicense
      style={{ width: '100%', height: '100%' }}
    />,
  );
}

const inks = (colors: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(colors).map(([role, ink]) => [
      role,
      kit.palette[ink as keyof typeof kit.palette],
    ]),
  );

// A library piece previewed alone and still (pieces never animate themselves), centred on the ground.
function showPiece(code: string, name: string, colors: Record<string, string>) {
  pieces = {};
  const Piece = load(code, inks(colors))?.[name] as
    React.ComponentType<{ x: number; y: number; scale: number }> | undefined;
  const Stage = () => (
    <remotion.AbsoluteFill style={{ background: kit.palette.ground }}>
      {Piece && <Piece x={kit.frame.width / 2} y={kit.frame.height / 2} scale={1} />}
    </remotion.AbsoluteFill>
  );
  root.render(
    <Player
      component={Stage}
      durationInFrames={1}
      compositionWidth={kit.frame.width}
      compositionHeight={kit.frame.height}
      fps={30}
      errorFallback={() => null}
      acknowledgeRemotionLicense
      style={{ width: '100%', height: '100%' }}
    />,
  );
}

addEventListener('message', (event) => {
  if (event.source !== parent) return;
  if (
    event.data?.type === 'piece' &&
    typeof event.data.code === 'string' &&
    typeof event.data.name === 'string'
  )
    return showPiece(event.data.code, event.data.name, event.data.paletteRoles ?? {});
  if (event.data?.type !== 'cuts' || !Array.isArray(event.data.cuts)) return;
  const roles = inks(event.data.paletteRoles ?? {});
  // Set pieces load before the cuts that import them; new set pieces recompile every cut.
  const shared = typeof event.data.pieces === 'string' ? event.data.pieces : undefined;
  if (shared !== pieces.code) {
    pieces = { code: shared, exports: shared ? load(shared, roles) : undefined };
    loaded.forEach((own) => delete own.code);
  }
  show(
    (event.data.cuts as Incoming[]).map((cut, i) => {
      const own = (loaded[i] ??= {});
      if (cut.code && cut.code !== own.code) {
        own.code = cut.code;
        own.Component = compile(cut.code, roles);
      }
      // shortcut: a cut keeps its first narration and clip; a re-rendered Manim clip shows in the saved MP4.
      if (cut.audio instanceof Blob) own.audio ??= URL.createObjectURL(cut.audio);
      if (cut.clip instanceof Blob) own.clip ??= URL.createObjectURL(cut.clip);
      return {
        playable: cut.playable === true,
        timing: cut.timing,
        emphasis: cut.emphasis,
        Component: own.Component,
        audio: own.audio,
        clip: own.clip,
      };
    }),
  );
});
