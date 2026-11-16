// The host's data path into a cut and the 3D camera, shared by live playback and the background render.
import { interpolate, useCurrentFrame } from 'remotion';
import { useThree } from '@react-three/fiber';
import { ease } from './video-kit';

// Data the host delivered by ID: the render reads it from stock.json beside the cut, live playback from
// the frame's message. Stock catalogs are retired (ADR 0005), so nothing reads it yet; exhibits will.
export let hostData: Record<string, unknown> = {};
export const setStock = (data: typeof hostData) => {
  hostData = data ?? {};
};

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
