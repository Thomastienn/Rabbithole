// The host's data path into a cut and the 3D camera, shared by live playback and the background render.
import { Img, interpolate, useCurrentFrame } from 'remotion';
import { useThree } from '@react-three/fiber';
import { ease, fonts, palette } from './video-kit';

// Exhibits the host delivered by id (ADR 0005): the render reads them from stock.json beside the cut, with
// images as data URLs; live playback from the frame's message, with images as blob URLs.
type ExhibitData = {
  kind: 'image' | 'quote';
  title: string;
  site: string;
  src?: string;
  text?: string;
  by?: string;
};
export let hostData: Record<string, ExhibitData> = {};
export const setStock = (data: typeof hostData) => {
  hostData = data ?? {};
};

// A real web image or quote, framed like a mounted print so it reads as real rather than drawn, with a short
// dim source line. x and y are its centre in frame pixels, width its unscaled width, rotation in degrees.
// An exhibit the host did not deliver draws nothing, so the cut still works without it.
export function Exhibit({
  id,
  x = 960,
  y = 480,
  width = 640,
  scale = 1,
  rotation = 0,
  opacity = 1,
}: {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
}) {
  const e = hostData[id];
  if (!e || (e.kind === 'image' ? !e.src : !e.text)) return null;
  const source = [e.title, e.site].filter(Boolean).join(' · ');
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        opacity,
        transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
        padding: 14,
        background: palette.paper,
        boxShadow: '0 18px 40px #0000008c',
      }}
    >
      {e.kind === 'image' ? (
        <Img src={e.src!} style={{ display: 'block', width: '100%' }} />
      ) : (
        <div style={{ padding: '18px 22px', color: palette.ground }}>
          <div style={{ fontFamily: fonts.reading, fontSize: 34, lineHeight: 1.35 }}>
            “{e.text}”
          </div>
          {e.by && (
            <div style={{ fontFamily: fonts.heading, fontSize: 24, marginTop: 14 }}>— {e.by}</div>
          )}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '100%',
          marginTop: 10,
          fontFamily: fonts.heading,
          fontSize: 18,
          color: palette.muted,
          opacity: 0.75,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {source}
      </div>
    </div>
  );
}

// Camera move for a 3D cut, set every frame from useCurrentFrame: eased between keys (frames ascending).
type Vec3 = [number, number, number];
export type CameraKey = { at: number; position: Vec3; target?: Vec3 };
export function cameraAt(keys: CameraKey[], f: number) {
  const ks = keys.length > 1 ? keys : [keys[0], { ...keys[0], at: keys[0].at + 1 }];
  const at = (get: (k: CameraKey) => Vec3) =>
    [0, 1, 2].map((i) =>
      interpolate(
        f,
        ks.map((k) => k.at),
        ks.map((k) => get(k)[i]),
        { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      ),
    ) as Vec3;
  return { position: at((k) => k.position), target: at((k) => k.target ?? [0, 0, 0]) };
}
export function Camera({ keys }: { keys: CameraKey[] }) {
  const camera = useThree((s) => s.camera);
  const { position, target } = cameraAt(keys, useCurrentFrame());
  camera.position.set(...position);
  camera.lookAt(...target);
  return null;
}
