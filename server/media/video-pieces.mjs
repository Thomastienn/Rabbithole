import {
  PIECES_INSTRUCTIONS,
  PIECES_LIBRARY_NOTE,
  PIECES_PARTS_NOTE,
  PIECES_3D,
  PIECE_IMPROVE_INSTRUCTIONS,
  PIECE_PATCH_NOTE,
} from './video-cut.mjs';
import { REMOTION_SKILL } from './skills.mjs';
import {
  cutSource,
  pieceChoices,
  remapRoles,
  assemblePieces,
  libraryPieces,
  CUT_ATTEMPTS,
} from './video-plan.mjs';
import { patched, withSource } from './patches.mjs';
import { withoutPaths } from './video-sandbox.mjs';

export const piecesError = (reason) =>
  new Error(`Set pieces: ${withoutPaths(reason).replace(/\.$/, '')}. Retry keeps the plan.`);

// A saved piece (a store pieceTree) with its parts scoped inside each form so it stands alone, and every role
// the assembly colours with. A part named in own is left to the module around it: the video's own set piece
// of that name wins over the library part.
export function withParts(piece, own = new Set()) {
  const parts = (piece.parts ?? [])
    .filter((p) => !own.has(p.name))
    .map((p) => ({ name: p.name, inner: p.piece.name, ...withParts(p.piece, own) }));
  if (!parts.length)
    return { source: piece.source, source3d: piece.source3d ?? null, roles: piece.roles };
  return {
    source: assemblePieces(piece.source, parts),
    source3d:
      piece.source3d &&
      assemblePieces(
        piece.source3d,
        parts
          .filter((p) => p.source3d)
          .map((p) => ({ name: `${p.name}3D`, inner: `${p.inner}3D`, source: p.source3d })),
      ),
    roles: [...new Set([...piece.roles, ...parts.flatMap((p) => p.roles)])],
  };
}

// A first answer may ask the library for candidate parts instead of writing: {"parts":[{name, look}]}.
// Returns null for any other answer; a malformed request throws so the writer retries.
function partRequest(raw, names) {
  let answer;
  try {
    answer = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null;
  }
  if (!Array.isArray(answer?.parts) || 'code' in answer || 'pieces' in answer) return null;
  const taken = new Set(names);
  for (const p of answer.parts) {
    if (!/^[A-Z]\w*$/.test(p?.name) || /3D$/.test(p.name) || taken.has(p.name) || !p.look?.trim?.())
      throw new Error('parts request needs a new PascalCase name and a look for each part.');
    taken.add(p.name);
  }
  if (!answer.parts.length) throw new Error('parts request lists no parts.');
  return answer.parts.map(({ name, look }) => ({ name, look }));
}

// One call writes the shared set pieces before any cut, offered the library's closest pieces for each look.
// The writer may first ask for parts; the library is then searched for them too and the call made again.
// Returns the accepted module, each name's and part's reuse/variant/new choice when anything was offered,
// and the parts ({name, look}) the module exports besides the named pieces.
export async function writeSetPieces({ plan, names, write, matches, signal }) {
  const objects = plan.styleBrief.recurringObjects.filter((o) => o.look);
  // A 3D cut draws each object with its <Name>3D mesh group; only the 2D names go to the library.
  const solid = plan.cuts.some((c) => c.dimension === '3d');
  const found = await matches(objects.map((o) => o.look));
  signal.throwIfAborted();
  const library = names.map((_, i) => found[i] ?? []);
  let parts = null;
  for (let attempt = 0, error; ; attempt++) {
    if (attempt === CUT_ATTEMPTS) throw piecesError(error.message);
    const all = [...names, ...(parts ?? []).map((p) => p.name)];
    const solidNames = solid ? all.map((n) => `${n}3D`) : [];
    const exported = [...all, ...solidNames];
    const offered = library.some((m) => m.length);
    let raw;
    try {
      raw = await write(
        PIECES_INSTRUCTIONS +
          '\n\n' +
          REMOTION_SKILL +
          PIECES_PARTS_NOTE +
          (offered ? PIECES_LIBRARY_NOTE : '') +
          (solid ? PIECES_3D : ''),
        JSON.stringify({
          styleBrief: plan.styleBrief,
          names,
          ...(parts && { parts }),
          ...(solid && { solidNames }),
          ...(offered && {
            library: all.map((name, i) => ({
              name,
              matches: library[i].map(
                ({ id, name, look, props, roles, source, source3d, parts }) => ({
                  id,
                  name,
                  look,
                  props,
                  roles,
                  source,
                  ...(source3d && { source3d }),
                  ...(parts?.length && { parts: parts.map((p) => p.name) }),
                }),
              ),
            })),
          }),
          ...(error && { validationError: error.message }),
        }),
      );
    } catch (e) {
      if (!e.invalidOutput) throw e;
      error = e;
      continue;
    }
    try {
      const asked = parts ? null : partRequest(raw, names);
      if (asked) {
        // Asking for parts is not a failed attempt; the library lookup runs once for them.
        const more = await matches(asked.map((p) => p.look));
        signal.throwIfAborted();
        library.push(...asked.map((_, i) => more[i] ?? []));
        parts = asked;
        attempt--;
        continue;
      }
      if (!offered)
        return {
          source: cutSource(raw, plan.styleBrief, exported),
          choices: null,
          parts: parts ?? [],
        };
      const { code, choices } = pieceChoices(raw, all, library, plan.styleBrief, solid);
      // A reused piece brings its parts, except those this video draws itself, and its 3D form when a 3D
      // cut needs it; 2D-only pieces get one written.
      const own = new Set(all);
      const reused = choices
        .map((c, i) => ({ ...c, colorRole: objects[i]?.colorRole }))
        .filter((c) => c.use === 'reuse')
        .flatMap((c) => {
          const whole = withParts(c.piece, own);
          const remap = (source) =>
            remapRoles(source, whole.roles, c.colorRole, plan.styleBrief, c.roles);
          return [
            { name: c.name, inner: c.piece.name, source: remap(whole.source) },
            ...(solid && whole.source3d
              ? [{ name: `${c.name}3D`, inner: `${c.piece.name}3D`, source: remap(whole.source3d) }]
              : []),
          ];
        });
      return {
        source: cutSource(assemblePieces(code, reused), plan.styleBrief, exported),
        choices,
        parts: parts ?? [],
      };
    } catch (e) {
      signal.throwIfAborted();
      error = e;
    }
  }
}

// One smart-model patch of a saved piece an audit flagged, or one whole rewrite when the patch does not apply;
// returns the validated library entry or throws. A piece with a 3D form is patched as one module holding both
// forms, which must export and validate both.
export async function improvePiece({ piece, why, call }) {
  const { name, look, props, roles, source, source3d, parts = [] } = piece;
  const names = source3d ? [name, `${name}3D`] : [name];
  // The piece colours through its own saved roles; the ink is irrelevant to validation.
  const brief = {
    paletteRoles: Object.fromEntries(roles.map((r) => [r, 'amber'])),
    recurringObjects: [{ look }],
  };
  const task = {
    name,
    look,
    props,
    roles,
    ...(parts.length && { parts: parts.map((p) => p.name) }),
    why,
  };
  // Both forms start with the same imports and helpers; the module keeps them once.
  const lines = source.split('\n'),
    solid = source3d?.split('\n') ?? [];
  let shared = 0;
  while (source3d && shared < lines.length && lines[shared] === solid[shared]) shared++;
  const module = [...lines, ...solid.slice(shared)].join('\n');
  const raw =
    patched(
      module,
      await call(
        PIECE_IMPROVE_INSTRUCTIONS + PIECE_PATCH_NOTE + '\n\n' + REMOTION_SKILL,
        withSource({ ...task, ...(source3d && { source3d: true }) }, 'source', module),
      ),
    ) ??
    (await call(
      PIECE_IMPROVE_INSTRUCTIONS + '\n\n' + REMOTION_SKILL,
      JSON.stringify({ ...task, source, ...(source3d && { source3d }) }),
    ));
  return libraryPieces(cutSource(raw, brief, names), brief, [name])[0];
}
