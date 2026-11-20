import {
  PIECES_INSTRUCTIONS,
  PIECES_LIBRARY_NOTE,
  PIECES_PARTS_NOTE,
  PIECES_3D,
  PIECES_PATCH_NOTE,
  PIECE_IMPROVE_INSTRUCTIONS,
  PIECE_PATCH_NOTE,
  PIECES_REFERENCE_NOTE,
} from './video-cut.mjs';
import { REMOTION_SKILL } from './skills.mjs';
import {
  cutSource,
  pieceChoices,
  assemblePieces,
  libraryPieces,
  CUT_ATTEMPTS,
} from './video-plan.mjs';
import { patched, withSource } from './patches.mjs';
import { withoutPaths } from './video-sandbox.mjs';

// A reused piece takes the new video's palette roles: kept when the brief has them, else the object's colorRole.
// A role the piece saved as a true colour ({role: hex}) becomes that hex, so the real object keeps its colour.
export function remapRoles(source, from, colorRole, brief, roles = {}, trueColors = {}) {
  if (!from.length) return source;
  // shortcut: a neutral object (no colorRole) falls back to the first brief role; map to palette neutrals if that reads wrong.
  const fallback = colorRole ?? Object.keys(brief.paletteRoles)[0];
  const to = (r) => roles[r] ?? (Object.hasOwn(brief.paletteRoles, r) ? r : fallback);
  const alt = from.map(RegExp.escape).join('|');
  return source.replace(
    new RegExp(`\\bcolors\\s*(?:\\.\\s*(${alt})\\b|\\[\\s*['"\`](${alt})['"\`]\\s*\\])`, 'g'),
    (_, a, b) =>
      Object.hasOwn(trueColors, a ?? b)
        ? JSON.stringify(trueColors[a ?? b])
        : `colors.${to(a ?? b)}`,
  );
}

// Saved true colours as brief trueColors that accept their hex literals, keyed apart from any brief role or ink.
const prefixed = (colors) =>
  Object.fromEntries(Object.entries(colors).map(([k, hex]) => [`kept${k}`, hex]));

export const piecesError = (reason) =>
  new Error(`Set pieces: ${withoutPaths(reason).replace(/\.$/, '')}. Retry keeps the plan.`);

// A saved piece (a store pieceTree) with its parts scoped inside each form so it stands alone, and every role
// the assembly colours with. A part named in own is left to the module around it: the video's own set piece
// of that name wins over the library part.
export function withParts(piece, own = new Set()) {
  const parts = (piece.parts ?? [])
    .filter((p) => !own.has(p.name))
    .map((p) => ({ name: p.name, inner: p.piece.name, ...withParts(p.piece, own) }));
  const trueColors = Object.assign({}, ...parts.map((p) => p.trueColors), piece.trueColors);
  if (!parts.length)
    return {
      source: piece.source,
      source3d: piece.source3d ?? null,
      roles: piece.roles,
      trueColors,
    };
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
    trueColors,
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

// The code of a {"pieces", "code"} answer, patched in place so its piece choices stay; null when unreadable.
function answerCode(raw) {
  let answer;
  try {
    answer = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null;
  }
  return typeof answer?.code === 'string'
    ? { code: answer.code, wrap: (code) => JSON.stringify({ ...answer, code }) }
    : null;
}

// One call writes the shared set pieces before any cut, offered the library's closest pieces for each look.
// The writer may first ask for parts; the library is then searched for them too and the call made again.
// Named pieces drawn so far in a streaming module: each counts once a later export follows it, its 3D form with it.
export function piecesDrawn(text, names) {
  const seen = [...text.matchAll(/export\s+(?:const|function)\s+(\w+?)(?:3D)?\b/g)].map(
    (m) => m[1],
  );
  const done = new Set(seen.slice(0, -1));
  const drawing = names.filter((n) => !done.has(n));
  return { drawing, drawn: names.length - drawing.length, total: names.length };
}

// Returns the accepted module, each name's and part's reuse/variant/new choice when anything was offered,
// and the parts ({name, look}) the module exports besides the named pieces.
export async function writeSetPieces({
  plan,
  names,
  write,
  matches,
  signal,
  onDrawing = () => {},
  // Reference photos ({name, image}) the writer sees as images.
  photos = [],
}) {
  const objects = plan.styleBrief.recurringObjects.filter((o) => o.look);
  // A 3D cut draws each object with its <Name>3D mesh group; only the 2D names go to the library.
  const solid = plan.cuts.some((c) => c.dimension === '3d');
  const found = await matches(objects.map((o) => o.look));
  signal.throwIfAborted();
  const library = names.map((_, i) => found[i] ?? []);
  let parts = null,
    // The module that last failed its check: its code and how to put a patched code back into an answer.
    failed = null;
  onDrawing(piecesDrawn('', names));
  for (let attempt = 0, error; ; attempt++) {
    if (attempt === CUT_ATTEMPTS) throw piecesError(error.message);
    const all = [...names, ...(parts ?? []).map((p) => p.name)];
    const solidNames = solid ? all.map((n) => `${n}3D`) : [];
    const exported = [...all, ...solidNames];
    const offered = library.some((m) => m.length);
    let raw = null;
    const retry = failed;
    failed = null;
    try {
      const instructions =
        PIECES_INSTRUCTIONS +
        '\n\n' +
        REMOTION_SKILL +
        PIECES_PARTS_NOTE +
        (offered ? PIECES_LIBRARY_NOTE : '') +
        (solid ? PIECES_3D : '') +
        (photos.length ? PIECES_REFERENCE_NOTE : '');
      const input = {
        styleBrief: plan.styleBrief,
        names,
        ...(parts && { parts }),
        ...(solid && { solidNames }),
        ...(offered && {
          library: all.map((name, i) => ({
            name,
            matches: library[i].map(
              ({ id, name, look, props, roles, trueColors, source, source3d, parts }) => ({
                id,
                name,
                look,
                props,
                roles,
                ...(Object.keys(trueColors ?? {}).length && { trueColors }),
                source,
                ...(source3d && { source3d }),
                ...(parts?.length && { parts: parts.map((p) => p.name) }),
              }),
            ),
          })),
        }),
        ...(photos.length && { referencePhotos: photos.map((p) => p.name) }),
        ...(error && { validationError: error.message }),
      };
      const images = photos.length ? photos.map((p) => p.image) : undefined;
      // A module that failed its check is repaired by a patch; when it does not apply, one whole module
      // within this attempt, as cut repairs do.
      if (retry) {
        const code = patched(
          retry.code,
          await write(
            instructions + PIECES_PATCH_NOTE,
            withSource(input, 'failedCode', retry.code),
            undefined,
            images,
          ),
        );
        if (code !== null) raw = retry.wrap(code);
      }
      raw ??= await write(
        instructions,
        JSON.stringify(input),
        (_, text) => onDrawing(piecesDrawn(text, names)),
        images,
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
      failed = offered ? answerCode(raw) : { code: raw, wrap: (code) => code };
      if (!failed?.code.trim()) failed = null;
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
            remapRoles(
              source,
              whole.roles,
              c.colorRole,
              plan.styleBrief,
              c.roles,
              whole.trueColors,
            );
          return [
            { name: c.name, inner: c.piece.name, source: remap(whole.source) },
            ...(solid && whole.source3d
              ? [{ name: `${c.name}3D`, inner: `${c.piece.name}3D`, source: remap(whole.source3d) }]
              : []),
          ];
        });
      // Reused pieces bring their true colours as hex literals, and a variant may copy them; the module
      // accepts the offered pieces' true colours too.
      const kept = Object.assign({}, ...library.flat().map((m) => withParts(m).trueColors));
      const brief = {
        ...plan.styleBrief,
        trueColors: { ...plan.styleBrief.trueColors, ...prefixed(kept) },
      };
      return {
        source: cutSource(assemblePieces(code, reused), brief, exported),
        choices,
        parts: parts ?? [],
      };
    } catch (e) {
      signal.throwIfAborted();
      error = e;
      if (e.choice) failed = null;
    }
  }
}

// One smart-model patch of a saved piece an audit flagged, or one whole rewrite when the patch does not apply;
// returns the validated library entry or throws. A piece with a 3D form is patched as one module holding both
// forms, which must export and validate both.
export async function improvePiece({ piece, why, call }) {
  const { name, look, props, roles, trueColors = {}, source, source3d, parts = [] } = piece;
  const names = source3d ? [name, `${name}3D`] : [name];
  // The piece colours through its own saved roles; the ink is irrelevant to validation.
  const brief = {
    paletteRoles: Object.fromEntries(roles.map((r) => [r, 'amber'])),
    trueColors: prefixed(trueColors),
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
  // The saved true colours stay as they were; the rewrite draws through the same roles.
  return { ...libraryPieces(cutSource(raw, brief, names), brief, [name])[0], trueColors };
}
