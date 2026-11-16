import { PIECES_INSTRUCTIONS, PIECES_LIBRARY_NOTE } from './video-cut.mjs';
import {
  cutSource,
  pieceChoices,
  remapRoles,
  assemblePieces,
  CUT_ATTEMPTS,
} from './video-plan.mjs';
import { withoutPaths } from './video-sandbox.mjs';

export const piecesError = (reason) =>
  new Error(`Set pieces: ${withoutPaths(reason).replace(/\.$/, '')}. Retry keeps the plan.`);

// One call writes the shared set pieces before any cut, offered the library's closest pieces for each look.
// Returns the accepted module and, when matches were offered, each name's reuse/variant/new choice.
export async function writeSetPieces({ plan, names, write, matches, signal }) {
  const objects = plan.styleBrief.recurringObjects.filter((o) => o.look);
  const library = await matches(objects.map((o) => o.look));
  signal.throwIfAborted();
  const offered = library.some((m) => m?.length);
  for (let attempt = 0, error; ; attempt++) {
    if (attempt === CUT_ATTEMPTS) throw piecesError(error.message);
    let raw;
    try {
      raw = await write(
        PIECES_INSTRUCTIONS + (offered ? PIECES_LIBRARY_NOTE : ''),
        JSON.stringify({
          styleBrief: plan.styleBrief,
          names,
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
      if (!offered) return { source: cutSource(raw, plan.styleBrief, names), choices: null };
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
        source: cutSource(assemblePieces(code, reused), plan.styleBrief, names),
        choices,
      };
    } catch (e) {
      error = e;
    }
  }
}
