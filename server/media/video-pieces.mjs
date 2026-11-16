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
  stockSource,
  CUT_ATTEMPTS,
} from './video-plan.mjs';
import { withoutPaths } from './video-sandbox.mjs';

export const piecesError = (reason) =>
  new Error(`Set pieces: ${withoutPaths(reason).replace(/\.$/, '')}. Retry keeps the plan.`);

// A stock piece fetch retried once; null (unknown ID) counts as a failure.
export async function fetchStock(stock, id) {
  for (let attempt = 0; ; attempt++)
    try {
      const data = await stock.piece(id);
      if (data == null) throw new Error(`Stock piece ${id} is unknown`);
      return data;
    } catch (error) {
      if (attempt) throw error;
    }
}

// One call writes the shared set pieces before any cut, offered the library's closest pieces for each look
// and stock pieces matched by each object's name. Returns the accepted module and, when anything was offered,
// each name's stock/reuse/variant/new choice. Stock pieces are fetched before acceptance; one that still fails
// after a retry withdraws that object's stock offers and asks again, without spending a repair attempt.
export async function writeSetPieces({ plan, names, write, matches, stock = null, signal }) {
  const objects = plan.styleBrief.recurringObjects.filter((o) => o.look);
  // A 3D cut draws each object with its <Name>3D mesh group; only the 2D names go to the library.
  const solidNames = plan.cuts.some((c) => c.dimension === '3d') ? names.map((n) => `${n}3D`) : [];
  const exported = [...names, ...solidNames];
  const library = await matches(objects.map((o) => o.look));
  const dimension = plan.cuts.some((c) => c.engine === 'remotion') ? undefined : '2D';
  const shortlist = stock
    ? await stock
        .match(
          objects.map((o) => o.name),
          dimension,
        )
        .then(
          (matches) =>
            matches.map(({ pieces }) =>
              pieces.filter((p) => !dimension || p.dimension === dimension),
            ),
          () => [],
        )
    : [];
  signal.throwIfAborted();
  const offered = library.some((m) => m?.length) || shortlist.some((m) => m?.length);
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
            stock: names.map((name, i) => ({
              name,
              pieces: (shortlist[i] ?? []).map(({ id, title, type, dimension }) => ({
                id,
                title,
                type,
                dimension,
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
      if (!offered) {
        if (/\b(?:StockPiece|setStock)\b/.test(raw))
          throw new Error('No stock pieces were offered.');
        return { source: cutSource(raw, plan.styleBrief, exported), choices: null };
      }
      const { code, choices } = pieceChoices(raw, names, library, plan.styleBrief, shortlist);
      const selected = choices.filter((c) => c.use === 'stock');
      const missing = new Set();
      for (const id of new Set(selected.map((c) => c.stock.id)))
        await fetchStock(stock, id).catch(() => missing.add(id));
      const failed = selected.filter((c) => missing.has(c.stock.id));
      signal.throwIfAborted();
      if (failed.length) {
        for (const [i, offers] of shortlist.entries())
          shortlist[i] = failed.some((c) => c.name === names[i])
            ? []
            : offers.filter((p) => !missing.has(p.id));
        error = new Error(
          `stock ${failed.map((c) => `${c.stock.id} for ${c.name}`).join(', ')} could not be fetched and is no longer offered; choose reuse or new for ${failed.map((c) => c.name).join(', ')}.`,
        );
        attempt--;
        continue;
      }
      const placed = choices
        .map((c, i) => ({ ...c, colorRole: objects[i].colorRole }))
        .filter((c) => c.use === 'stock')
        .map((c) =>
          stockSource(
            c.name,
            c.stock.id,
            Object.hasOwn(plan.styleBrief.paletteRoles, c.colorRole) && c.colorRole,
          ),
        );
      const reused = choices
        .map((c, i) => ({ ...c, colorRole: objects[i].colorRole }))
        .filter((c) => c.use === 'reuse')
        .map((c) => ({
          name: c.name,
          inner: c.piece.name,
          source: remapRoles(c.piece.source, c.piece.roles, c.colorRole, plan.styleBrief, c.roles),
        }));
      return {
        source: cutSource(assemblePieces(code, reused, placed), plan.styleBrief, exported),
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
