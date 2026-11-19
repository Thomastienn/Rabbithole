// The host's data path into a cut, the 3D camera and many copies of a part, shared by live playback and the background render.
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Img, Loop, OffthreadVideo, Sequence, random, staticFile, useCurrentFrame } from 'remotion';
import { context as fiber, useFrame, useThree } from '@react-three/fiber';
import {
  Euler,
  InstancedMesh,
  Matrix4,
  PCFShadowMap,
  PMREMGenerator,
  Quaternion,
  Vector3,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { fonts, palette } from './video-kit';

// Exhibits the host delivered by id (ADR 0005): the render reads them from stock.json beside the cut, with
// images as data URLs and clips as public files; live playback from the frame's message, with blob URLs.
type ExhibitData = {
  kind: 'image' | 'quote' | 'clip';
  title: string;
  site: string;
  src?: string;
  text?: string;
  by?: string;
  clip?: string;
  seconds?: number;
  // A clip with sound starts at its narration pause, whatever the cut passes.
  from?: number;
};
export let hostData: Record<string, ExhibitData> = {};
export const setStock = (data: typeof hostData) => {
  hostData = data ?? {};
};

// A real web image or quote, framed like a mounted print so it reads as real rather than drawn, with a short
// dim source line. x and y are its centre in frame pixels, width its unscaled width, rotation in degrees.
// A clip plays muted from frame `from`, looping if shown longer than it lasts.
// An exhibit the host did not deliver draws nothing, so the cut still works without it.
export function Exhibit({
  id,
  x = 960,
  y = 480,
  width = 640,
  scale = 1,
  rotation = 0,
  opacity = 1,
  from = 0,
}: {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  from?: number;
}) {
  const e = hostData[id];
  if (!e || (e.kind === 'quote' ? !e.text : !(e.src || e.clip))) return null;
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
      {e.kind === 'clip' ? (
        <div style={{ width: '100%', aspectRatio: '16 / 9', background: '#000' }}>
          <Sequence from={Math.round(e.from ?? from)} layout="none">
            <Loop durationInFrames={Math.max(1, Math.round((e.seconds ?? 1) * 30))} layout="none">
              <OffthreadVideo
                src={e.src ?? staticFile(e.clip!)}
                muted
                style={{ display: 'block', width: '100%', height: '100%' }}
              />
            </Loop>
          </Sequence>
        </div>
      ) : e.kind === 'image' ? (
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

// Camera for a 3D cut, set every frame from useCurrentFrame: a Catmull-Rom path through the keys (frames ascending),
// so velocity carries through each key, plus a slow orbit about the target that a key's pace scales (default 1).
// The orbit never stops: pace is floored, and it keeps turning before the first key and after the last.
type Vec3 = [number, number, number];
export type CameraKey = { at: number; position: Vec3; target?: Vec3; pace?: number };
const ORBIT = (2 * Math.PI) / 2400; // radians a frame at pace 1: one turn in 80 seconds
export function cameraAt(keys: CameraKey[], f: number) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const k = (j: number) => keys[Math.max(0, Math.min(keys.length - 1, j))];
  const segment = (t: number) => {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1].at) i++;
    const span = k(i + 1).at - k(i).at;
    return { i, u: span > 0 ? clamp((t - k(i).at) / span) : 0 };
  };
  const { i, u } = segment(f);
  const path = (get: (k: CameraKey) => Vec3) =>
    [0, 1, 2].map((d) => {
      const [p0, p1, p2, p3] = [i - 1, i, i + 1, i + 2].map((j) => get(k(j))[d]);
      return (
        p1 +
        0.5 *
          ((p2 - p0) * u +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
            (3 * p1 - p0 - 3 * p2 + p3) * u * u * u)
      );
    }) as Vec3;
  const target = path((k) => k.target ?? [0, 0, 0]);
  const [x, y, z] = path((k) => k.position);
  const pace = (t: number) => {
    const { i, u } = segment(t);
    return Math.max(0.1, (k(i).pace ?? 1) + ((k(i + 1).pace ?? 1) - (k(i).pace ?? 1)) * u);
  };
  let angle = 0;
  for (let t = 0; t < f; t++) angle += ORBIT * pace(t);
  const [dx, dz] = [x - target[0], z - target[2]];
  const position: Vec3 = [
    target[0] + dx * Math.cos(angle) + dz * Math.sin(angle),
    y,
    target[2] - dx * Math.sin(angle) + dz * Math.cos(angle),
  ];
  return { position, target };
}
export function Camera({ keys }: { keys: CameraKey[] }) {
  const camera = useThree((s) => s.camera);
  const { position, target } = cameraAt(keys, useCurrentFrame());
  camera.position.set(...position);
  camera.lookAt(...target);
  return null;
}

// Where a 3D point lands in the 1920x1080 frame at frame f, through the same camera path, for a ThreeCanvas that
// fills the frame (canvas size sets the aspect; fov is vertical degrees, 75 being the canvas default). front is
// false behind the camera; opacity fades a pin over 60 pixels at the frame edge and is 0 behind or off frame.
export function screenAt(
  keys: CameraKey[],
  f: number,
  point: Vec3,
  { width = 1920, height = 1080, fov = 75 } = {},
) {
  const { position: p, target: t } = cameraAt(keys, f);
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const unit = (a: Vec3) => a.map((v) => v / (Math.hypot(...a) || 1)) as Vec3;
  const forward = unit(sub(t, p));
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const d = sub(point, p);
  const depth = dot(d, forward);
  const front = depth > 0.1; // the canvas camera's near plane
  const half = Math.tan((fov * Math.PI) / 360) * Math.max(depth, 1e-6);
  const x = ((dot(d, right) / (half * (width / height)) + 1) / 2) * 1920;
  const y = ((1 - dot(d, up) / half) / 2) * 1080;
  const edge = Math.min(x, 1920 - x, y, 1080 - y);
  return { x, y, front, opacity: front ? Math.max(0, Math.min(1, edge / 60)) : 0 };
}

// HTML above the ThreeCanvas pinned to a 3D point (or a function of the frame, for idle motion): its children are
// centred on the point's place in the frame and fade when the point goes behind the camera or off frame.
export function Pin({
  keys,
  at,
  fov,
  children,
}: {
  keys: CameraKey[];
  at: Vec3 | ((f: number) => Vec3);
  fov?: number;
  children: ReactNode;
}) {
  const f = useCurrentFrame();
  const { x, y, opacity } = screenAt(keys, f, typeof at === 'function' ? at(f) : at, { fov });
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        opacity,
        display: opacity ? undefined : 'none',
      }}
    >
      {children}
    </div>
  );
}

// Many copies of one set piece or part, such as a crowd: vary(i, rand) returns copy i's props (position or x and y,
// scale, state, roles), rand() a seeded 0 to 1 sequence so every frame draws the same copies. Inside a ThreeCanvas
// each mesh of the piece is drawn once per group of copies sharing their other props, with three.js instancing.
type Copy = Record<string, any>;
export function Copies<P extends Copy>({
  of: Piece,
  count,
  seed = 0,
  vary,
}: {
  of: ComponentType<P>;
  count: number;
  seed?: number | string;
  vary: (i: number, rand: () => number) => P;
}) {
  const copies = Array.from({ length: count }, (_, i) => {
    let n = 0;
    return vary(i, () => random(`${seed}:${i}:${n++}`));
  });
  const solid = useContext(fiber);
  if (!solid)
    return (
      <>
        {copies.map((p, i) => (
          <Piece key={i} {...p} />
        ))}
      </>
    );
  const groups = new Map<string, { props: Copy; items: Copy[] }>();
  for (const copy of copies) {
    const { position, rotation, scale, ...props } = copy;
    const key = JSON.stringify(props);
    if (!groups.has(key)) groups.set(key, { props, items: [] });
    groups.get(key)!.items.push(copy);
  }
  return (
    <>
      {[...groups].map(([key, { props, items }]) => (
        <Instanced key={key} piece={Piece as ComponentType<Copy>} props={props} items={items} />
      ))}
    </>
  );
}
const place = new Matrix4(),
  turn = new Quaternion(),
  angles = new Euler(),
  at = new Vector3(),
  size = new Vector3();
// A hidden copy of the piece is the template; its meshes, relative to it, become instanced meshes beside it.
function Instanced({
  piece: Piece,
  props,
  items,
}: {
  piece: ComponentType<Copy>;
  props: Copy;
  items: Copy[];
}) {
  const template = useRef<any>(null),
    host = useRef<any>(null);
  useLayoutEffect(() => {
    const root = template.current!,
      parent = host.current!;
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const meshes: any[] = [];
    root.traverse((o: any) => o.isMesh && meshes.push(o));
    const made = meshes.map((mesh) => {
      const copies = new InstancedMesh(mesh.geometry, mesh.material, items.length);
      const local = inverse.clone().multiply(mesh.matrixWorld);
      items.forEach(({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 }, i) => {
        place.compose(
          at.set(...(position as [number, number, number])),
          turn.setFromEuler(angles.set(...(rotation as [number, number, number]))),
          typeof scale === 'number'
            ? size.setScalar(scale)
            : size.set(...(scale as [number, number, number])),
        );
        copies.setMatrixAt(i, place.multiply(local));
      });
      copies.frustumCulled = false;
      parent.add(copies);
      return copies;
    });
    // shortcut: rebuilt every render, cheap for hundreds of copies; update matrices in place if crowds grow to thousands.
    return () =>
      made.forEach((copies) => {
        parent.remove(copies);
        copies.dispose();
      });
  });
  return (
    <>
      <group ref={template} visible={false}>
        <Piece {...props} />
      </group>
      <group ref={host} />
    </>
  );
}

// Soft room light generated in code (no file) for gentle reflections, and soft shadows from the key light
// onto a shadow-only ground at y = GROUND. Quality is fixed low for smooth live playback.
export const GROUND = -2;
export function Lights() {
  const { gl, scene } = useThree();
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = PCFShadowMap;
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const map = pmrem.fromScene(room, 0.04).texture;
    scene.environment = map;
    scene.environmentIntensity = 0.45;
    room.dispose();
    pmrem.dispose();
    return () => {
      if (scene.environment === map) scene.environment = null;
      map.dispose();
    };
  }, [gl, scene]);
  // Meshes come from generated code, so the kit opts them in; runs on each rendered frame.
  useFrame(() =>
    scene.traverse((o: any) => {
      if (o.isMesh && !o.userData.ground) o.castShadow = true;
    }),
  );
  return (
    <>
      <ambientLight intensity={0.3} color="#fff4e2" />
      <directionalLight
        position={[4, 6, 5]}
        intensity={1.4}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-radius={6}
        shadow-bias={-0.0005}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-far={30}
      />
      <directionalLight position={[-5, -2, -4]} intensity={0.35} color={palette.lichen} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, GROUND, 0]}
        receiveShadow
        userData={{ ground: true }}
      >
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0.35} />
      </mesh>
    </>
  );
}
