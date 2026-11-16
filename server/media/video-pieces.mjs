import {
  PIECES_INSTRUCTIONS,
  PIECES_LIBRARY_NOTE,
  PIECES_3D,
  PIECE_IMPROVE_INSTRUCTIONS,
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
import { withoutPaths } from './video-sandbox.mjs';

export const piecesError = (reason) =>
  new Error(`Set pieces: ${withoutPaths(reason).replace(/\.$/, '')}. Retry keeps the plan.`);

// One call writes the shared set pieces before any cut, offered the library's closest pieces for each look.
// Returns the accepted module and, when anything was offered, each name's reuse/variant/new choice.
export async function writeSetPieces({ plan, names, write, matches, signal }) {
  const objects = plan.styleBrief.recurringObjects.filter((o) => o.look);
  // A 3D cut draws each object with its <Name>3D mesh group; only the 2D names go to the library.
  const solidNames = plan.cuts.some((c) => c.dimension === '3d') ? names.map((n) => `${n}3D`) : [];
  const exported = [...names, ...solidNames];
  const library = await matches(objects.map((o) => o.look));
  signal.throwIfAborted();
  const offered = library.some((m) => m?.length);
  for (let attempt = 0, error; ; attempt++) {
    if (attempt === CUT_ATTEMPTS) throw piecesError(error.message);
    let raw;
    try {
      raw = await write(
        PIECES_INSTRUCTIONS +
          '\n\n' +
          REMOTION_SKILL +
          (offered ? PIECES_LIBRARY_NOTE : '') +
          (solidNames.length ? PIECES_3D : ''),
        JSON.stringify({
          styleBrief: plan.styleBrief,
          names,
          ...(solidNames.length && { solidNames }),
          ...(offered && {
            library: names.map((name, i) => ({
              name,
              matches: (library[i] ?? []).map(({ id, name, look, props, roles, source }) => ({
                id,
                name,
                look,
                props,
                roles,
                source,
              })),
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
      if (!offered)
        return { source: cutSource(raw, plan.styleBrief, exported), choices: null };
      const { code, choices } = pieceChoices(raw, names, library, plan.styleBrief);
      const reused = choices
        .map((c, i) => ({ ...c, colorRole: objects[i].colorRole }))
        .filter((c) => c.use === 'reuse')
        .map((c) => ({
          name: c.name,
          inner: c.piece.name,
          source: remapRoles(c.piece.source, c.piece.roles, c.colorRole, plan.styleBrief, c.roles),
        }));
      return {
        source: cutSource(assemblePieces(code, reused), plan.styleBrief, exported),
        choices,
      };
    } catch (e) {
      signal.throwIfAborted();
      error = e;
    }
  }
}

// One smart-model rewrite of a saved piece an audit flagged; returns the validated library entry or throws.
export async function improvePiece({ piece, why, call }) {
  const { name, look, props, roles, source } = piece;
  // The piece colours through its own saved roles; the ink is irrelevant to validation.
  const brief = {
    paletteRoles: Object.fromEntries(roles.map((r) => [r, 'amber'])),
    recurringObjects: [{ look }],
  };
  const raw = await call(
    PIECE_IMPROVE_INSTRUCTIONS + '\n\n' + REMOTION_SKILL,
    JSON.stringify({ name, look, props, roles, source, why }),
  );
  return libraryPieces(cutSource(raw, brief, [name]), brief, [name])[0];
}
