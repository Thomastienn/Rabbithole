// A library piece's 3D form in the player frame: it turns slowly and a drag orbits it.
import { useRef, type ComponentType, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as kit from '../../server/media/video-kit';

export type Orbit = { yaw: number; pitch: number };
export const SPIN = 0.3; // radians per second, about one turn in 20 s
const DRAG = 0.01, // radians per dragged pixel
    PITCH = 1.2;

// Spin while idle (not under reduced motion); a drag turns yaw and tilts pitch, never past the poles.
export function orbit(o: Orbit, { dt = 0, dx = 0, dy = 0, still = false }) {
    return {
        yaw: o.yaw + (still ? 0 : dt * SPIN) + dx * DRAG,
        pitch: Math.max(-PITCH, Math.min(PITCH, o.pitch + dy * DRAG)),
    };
}

export type Motion = { orbit: Orbit; drag?: { x: number; y: number }; still: boolean };

export function Spin({ motion, children }: { motion: Motion; children: ReactNode }) {
    const group = useRef<{ rotation: { set(x: number, y: number, z: number): unknown } }>(null);
    useFrame((_, dt) => {
        motion.orbit = orbit(motion.orbit, { dt, still: motion.still || !!motion.drag });
        group.current?.rotation.set(motion.orbit.pitch, motion.orbit.yaw, 0);
    });
    return <group ref={group}>{children}</group>;
}

export function Turntable({ Piece, label }: { Piece: ComponentType; label: string }) {
    const motion = useRef<Motion>({
        orbit: { yaw: 0, pitch: 0.25 },
        still:
            typeof matchMedia === 'function' &&
            matchMedia('(prefers-reduced-motion: reduce)').matches,
    }).current;
    return (
        <Canvas
            aria-label={label}
            camera={{ position: [0, 0, 7], fov: 40 }}
            style={{ width: '100%', height: '100%', touchAction: 'none', cursor: 'grab' }}
            onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                motion.drag = { x: e.clientX, y: e.clientY };
            }}
            onPointerMove={(e) => {
                if (!motion.drag) return;
                motion.orbit = orbit(motion.orbit, {
                    dx: e.clientX - motion.drag.x,
                    dy: e.clientY - motion.drag.y,
                });
                motion.drag = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={() => (motion.drag = undefined)}
            onPointerCancel={() => (motion.drag = undefined)}
        >
            <color attach="background" args={[kit.three.background]} />
            <kit.Lights />
            <Spin motion={motion}>
                <Piece />
            </Spin>
        </Canvas>
    );
}
