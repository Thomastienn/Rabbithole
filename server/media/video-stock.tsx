// Host-only stock placement and the 3D camera, shared by live playback and the background render.
import { useEffect, useState, type CSSProperties } from 'react';
import { continueRender, delayRender, interpolate, useCurrentFrame } from 'remotion';
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Lights, ease, palette, type } from './video-kit';

// Stock pieces the host delivered by ID ({svg} or {glb: base64}, null when the fetch failed): the
// render reads them from stock.json beside the cut, live playback from the app's stock route.
let stock: Record<string, { svg?: string; glb?: string } | null> = {};
export const setStock = (data: typeof stock) => {
  stock = data ?? {};
};
// The whole parsed model, centred and scaled to fit a 3-unit cube in front of the default camera.
function StockModel({
  id,
  glb,
  size,
  tint,
}: {
  id: string;
  glb: string;
  size: number;
  tint?: string;
}) {
  const [model, setModel] = useState<unknown>(null);
  const [handle] = useState(() => delayRender('stock piece'));
  useEffect(() => {
    let stopped = false;
    Promise.resolve()
      .then(() => {
        const bytes = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0));
        return new GLTFLoader().parseAsync(bytes.buffer, '');
      })
      .then(({ scene }) => {
        if (stopped) return;
        const box = new Box3().setFromObject(scene),
          extent = box.getSize(new Vector3());
        scene.scale.setScalar(3 / Math.max(extent.x, extent.y, extent.z, 1e-6));
        scene.position.copy(box.getCenter(new Vector3()).multiplyScalar(-scene.scale.x));
        if (tint)
          scene.traverse((object: any) => {
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material])
              material?.color?.set(tint);
          });
        setModel(scene);
      })
      .catch(() => {
        if (!stopped) setModel(false);
      })
      .finally(() => continueRender(handle));
    return () => {
      stopped = true;
      continueRender(handle);
    };
  }, [glb, tint]);
  if (model === false) return <StockMissing text={`${id} failed to load`} />;
  if (!model) return null;
  return (
    <ThreeCanvas width={size} height={size} camera={{ position: [0, 0, 5], fov: 40 }}>
      <Lights />
      <primitive object={model} />
    </ThreeCanvas>
  );
}
const StockMissing = ({ text }: { text: string }) => (
  <div role="status" style={{ ...type.label, color: palette.muted, textAlign: 'center' }}>
    Stock piece {text}
  </div>
);
// A stock set piece centred on x and y, 200 pixels square at scale 1; highlight glows in glow.
export function StockPiece({
  id,
  x,
  y,
  scale = 1,
  highlight = false,
  glow = palette.amber,
  tint,
}: {
  id: string;
  x: number;
  y: number;
  scale?: number;
  highlight?: boolean;
  glow?: string;
  tint?: string;
}) {
  const size = 200 * scale,
    data = stock[id];
  const box: CSSProperties = {
    position: 'absolute',
    left: x - size / 2,
    top: y - size / 2,
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    filter: highlight ? `drop-shadow(0 0 ${size / 10}px ${glow})` : undefined,
  };
  if (data?.svg)
    return (
      <div
        style={box}
        dangerouslySetInnerHTML={{
          // The root svg fills the box; its viewBox keeps the drawing's proportions.
          __html: (tint
            ? data.svg.replace(/\b(fill|stroke)="(?!none")[^"]*"/g, `$1="${tint}"`)
            : data.svg
          ).replace(/<svg\b[^>]*>/, (tag) =>
            tag
              .replace(/\s(?:width|height)="[^"]*"/g, '')
              .replace(/^<svg/, '<svg width="100%" height="100%"'),
          ),
        }}
      />
    );
  return (
    <div style={box}>
      {data?.glb ? (
        <StockModel id={id} glb={data.glb} size={size} tint={tint} />
      ) : (
        <StockMissing text={`${id} is missing`} />
      )}
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
