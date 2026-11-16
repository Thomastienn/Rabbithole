// The frame's 3D stock pieces. Only this runtime holds the glTF loader; visual code gets finished
// objects through stockPiece(id) and never the loader itself.
import { Group, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Delivered GLB bytes become objects (or load errors) before the visual's scripts run, because
// stockPiece(id) answers synchronously. Other piece data passes through unchanged.
export async function loadModels(pieces: Record<string, unknown>) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(pieces).map(async ([id, data]) => [
        id,
        data instanceof ArrayBuffer
          ? await new GLTFLoader().parseAsync(data, '').then(
              (gltf: { scene: unknown }) => gltf.scene,
              (error: Error) =>
                new Error(`Stock piece ${id} failed to load: ${error?.message ?? error}`),
            )
          : data,
      ]),
    ),
  );
}

// A fresh copy of a loaded 3D piece, or an empty group plus a visible note when it failed to load.
// Without data the ID decides: 2D IDs carry the "fluent-emoji:" prefix and Polyfork slugs do not.
// Returns null for a 2D piece, which the SVG path handles.
export function modelPiece(root: HTMLElement, pieces: Record<string, unknown>, id: string) {
  const data = Object.hasOwn(pieces, id) ? pieces[id] : undefined;
  if (data instanceof Object3D) return (data as { clone(recursive: boolean): unknown }).clone(true);
  if (!(data instanceof Error) && (data != null || id.startsWith('fluent-emoji:'))) return null;
  const note = root.ownerDocument.createElement('p');
  note.setAttribute('role', 'status');
  note.textContent = data instanceof Error ? data.message : `Stock piece ${id} is missing`;
  root.append(note);
  return new Group();
}
