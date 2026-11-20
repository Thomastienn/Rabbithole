import { Color, DataTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';

// House-style materials by name: finish(kind, colour, pattern?) for a mesh's material prop. The colour is the
// material's colour; a pattern is a soft greyscale texture made in code, multiplied by it, with matching relief.
export type Finish = 'matte' | 'plastic' | 'metal' | 'glass' | 'glow';
export type Pattern =
    'wood' | 'brushed metal' | 'panel lines' | 'fabric' | 'stone' | 'tiles' | 'bands';
const SIZE = 256;
const TAU = 2 * Math.PI;
// Seeded lattice noise that wraps every `cells`, so patterns tile.
const hash = (i: number, j: number) => {
    const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return v - Math.floor(v);
};
const noise = (x: number, y: number, cells: number) => {
    const [u, v] = [(x / SIZE) * cells, (y / SIZE) * cells];
    const [i, j] = [Math.floor(u), Math.floor(v)];
    const [a, b] = [u - i, v - j].map((t) => t * t * (3 - 2 * t));
    const h = (di: number, dj: number) => hash((i + di) % cells, (j + dj) % cells);
    return (
        h(0, 0) +
        (h(1, 0) - h(0, 0)) * a +
        (h(0, 1) - h(0, 0)) * b +
        (h(0, 0) - h(1, 0) - h(0, 1) + h(1, 1)) * a * b
    );
};
// Each returns 0 (groove) to 1 (face) for a pixel.
const patterns: Record<Pattern, (x: number, y: number) => number> = {
    wood: (x, y) => 0.5 + 0.5 * Math.sin(TAU * (6 * (x / SIZE) + 1.5 * noise(x, y, 4))),
    'brushed metal': (x, y) => 0.6 * noise(x, y * 0.02, 64) + 0.4 * noise(x, y, 32),
    'panel lines': (x, y) => (x % 128 < 3 || y % 128 < 3 ? 0 : 1),
    fabric: (x, y) =>
        // Over-under weave: each 8-pixel square runs its threads across or along.
        0.5 + 0.5 * Math.sin((TAU * ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? x : y)) / 8),
    stone: (x, y) => 0.6 * noise(x, y, 8) + 0.4 * noise(x, y, 32),
    tiles: (x, y) =>
        x % 64 < 4 || y % 64 < 4 ? 0 : 0.7 + 0.3 * hash(Math.floor(x / 64), Math.floor(y / 64)),
    bands: (x, y) => 0.5 + 0.5 * Math.sin((TAU * 4 * y) / SIZE),
};
// Generated once per name; low contrast keeps the object's own colour in charge.
const textures = new Map<Pattern, InstanceType<typeof DataTexture>>();
export function patternTexture(name: Pattern) {
    if (!textures.has(name)) {
        const data = new Uint8Array(SIZE * SIZE * 4);
        for (let y = 0; y < SIZE; y++)
            for (let x = 0; x < SIZE; x++) {
                const grey = Math.round(255 * (0.82 + 0.18 * patterns[name](x, y)));
                data.set([grey, grey, grey, 255], (y * SIZE + x) * 4);
            }
        const texture = new DataTexture(data, SIZE, SIZE);
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.colorSpace = SRGBColorSpace;
        texture.needsUpdate = true;
        textures.set(name, texture);
    }
    return textures.get(name)!;
}
const looks: Record<Finish, object> = {
    matte: { roughness: 0.85, metalness: 0 },
    plastic: { roughness: 0.35, metalness: 0 },
    metal: { roughness: 0.3, metalness: 0.9 },
    glass: { roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false },
    glow: { roughness: 0.6, metalness: 0, emissiveIntensity: 0.9 },
};
// Cached so a render calling finish() every frame reuses one material.
const materials = new Map<string, InstanceType<typeof MeshStandardMaterial>>();
export function finish(kind: Finish, color: string, pattern?: Pattern) {
    const key = `${kind}|${color}|${pattern}`;
    if (!materials.has(key)) {
        const tint = new Color(color.slice(0, 7)); // drop a neutral's alpha
        const map = pattern && patterns[pattern] ? patternTexture(pattern) : null;
        materials.set(
            key,
            new MeshStandardMaterial({
                ...(looks[kind] ?? looks.matte),
                color: tint,
                ...(kind === 'glow' && { emissive: tint }),
                ...(map && { map, bumpMap: map, bumpScale: 0.6 }),
            }),
        );
    }
    return materials.get(key)!;
}
