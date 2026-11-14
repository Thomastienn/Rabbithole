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

// The server compiled each cut to a CommonJS body; an inline script (allowed by this frame's CSP) defines it.
function compile(code: string, colors: Record<string, string>) {
  let factory: ((...args: unknown[]) => void) | undefined;
  Object.assign(window, { __cut: (f: typeof factory) => (factory = f) });
  const script = document.createElement('script');
  script.textContent = `__cut(function (require, module, exports) {\n${code}\n})`;
  document.head.append(script);
  script.remove();
  const module = { exports: {} as { default?: LiveCut['Component'] } };
  try {
    factory?.(
      (name: string) => {
        if (name === './kit') return { ...kit, colors };
        if (name in libraries) return libraries[name];
        throw new Error(`Cut import is outside the kit: ${name}`);
      },
      module,
      module.exports,
    );
  } catch {
    return undefined;
  }
  return module.exports.default;
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

addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.type !== 'cuts' || !Array.isArray(event.data.cuts))
    return;
  const colors = event.data.paletteRoles ?? {};
  const roles = Object.fromEntries(
    Object.entries(colors).map(([role, ink]) => [
      role,
      kit.palette[ink as keyof typeof kit.palette],
    ]),
  );
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
