import { mkdir, writeFile, readFile, lstat, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  CUT_ENTRY,
  CUT_INSTRUCTIONS,
  CUT_3D,
  PIECES_INSTRUCTIONS,
  AUDIT_INSTRUCTIONS,
  REPAIR_NOTE,
  FIX_NOTE,
} from './video-cut.mjs';
import {
  cutJoin,
  cutSource,
  emphasisMark,
  pieceNames,
  CUT_ATTEMPTS,
  CUT_PAUSE_FRAMES,
  MAX_SOURCE,
  videoPalette,
} from './video-plan.mjs';
import { MANIM_INSTRUCTIONS, MANIM_AUDIT_INSTRUCTIONS, MANIM_COMPONENT } from './manim-cut.mjs';
import { stageNarration } from './narration.mjs';
import { withoutPaths } from './video-sandbox.mjs';

const unfenced = (raw) => raw.replace(/^[ \t]*(?:`{3,}|~{3,})[\w-]*[ \t]*(?:\n|$)/gm, '').trim();

// An audit answers {"ok":true} or {"issues":[{what, where}]}, never code; null means ok, anything unusable throws.
export function auditIssues(raw) {
  const answer = JSON.parse(unfenced(raw));
  if (answer?.ok === true && !answer.issues) return null;
  const issues = answer?.issues;
  if (
    !Array.isArray(issues) ||
    !issues.length ||
    issues.length > 8 ||
    !issues.every((i) =>
      [i?.what, i?.where].every((v) => typeof v === 'string' && v.trim() && v.length <= 500),
    )
  )
    throw new Error('Audit returned unreadable issues.');
  return issues;
}

// A fix answers {"code", "emphasis"?}; anything unusable throws.
export function auditFix(raw, brief, sentences, engine = 'remotion') {
  const answer = JSON.parse(unfenced(raw));
  if (typeof answer?.code !== 'string') throw new Error('Fix returned no code.');
  if (
    answer.emphasis !== undefined &&
    !(
      Array.isArray(answer.emphasis) &&
      answer.emphasis.length <= 12 &&
      answer.emphasis.every((m) => emphasisMark(m) && m.sentence < sentences)
    )
  )
    throw new Error('Fix returned unreadable emphasis.');
  return {
    code: engine === 'manim' ? answer.code.trim() : cutSource(answer.code, brief),
    ...(answer.emphasis && { emphasis: answer.emphasis }),
  };
}

// A cut's final validation or render failure; provider, sign-in and runtime errors keep their own wording.
export const cutError = (reason, index, count) =>
  new Error(
    `Cut ${index + 1} of ${count}: ${withoutPaths(reason).replace(/\.$/, '')}. Retry keeps the other cuts.`,
  );

export const piecesError = (reason) =>
  new Error(`Set pieces: ${withoutPaths(reason).replace(/\.$/, '')}. Retry keeps the plan.`);

export async function videoCall(provider, selection, instructions, input, signal, onText, images) {
  const items = new Map();
  let status, overflow;
  try {
    await provider.generate(
      { ...selection, thread: null, instructions, ...(images && { images }) },
      input,
      (event) => {
        if (signal.aborted) return;
        if ((event.type === 'delta' || event.type === 'item') && !overflow) {
          items.set(
            event.item,
            event.type === 'item' ? event.text : (items.get(event.item) ?? '') + event.text,
          );
          const bytes = [...items.values()].reduce((n, v) => n + Buffer.byteLength(v), 0);
          if (items.size > 32 || bytes > MAX_SOURCE) {
            overflow = true;
            items.clear();
          } else onText?.(bytes);
        }
        if (event.type === 'status') status = event.status;
      },
      () => {},
      signal,
    );
  } catch {
    signal.throwIfAborted();
    throw new Error('Video provider failed to generate a composition.');
  }
  signal.throwIfAborted();
  if (status !== 'completed') throw new Error('Video composition did not complete.');
  if (overflow)
    throw Object.assign(new Error('Video composition exceeds 64 KiB.'), { invalidOutput: true });
  return [...items.values()].join('\n\n');
}

export async function writeCuts({
  plan,
  workspace,
  kit,
  manimKit,
  call,
  write = call,
  narrate,
  snapshot,
  check,
  clip,
  signal,
  save,
  wait,
  stop,
  kept = [],
  pieces = null,
  onPieces = async () => {},
}) {
  // Retry keeps code from cuts not marked failed and timing whose audio was copied; the rest is written again.
  const cuts = plan.cuts.map((c, i) => ({
    engine: c.engine,
    status: 'pending',
    code: (kept[i]?.status !== 'failed' && kept[i]?.code) || null,
    timing: kept[i]?.timing ?? null,
    // A kept cut keeps its settled audit and the marks it chose.
    ...(kept[i]?.status !== 'failed' &&
      kept[i]?.code &&
      kept[i].audited && {
        audited: true,
        ...(kept[i].emphasis && { emphasis: kept[i].emphasis }),
      }),
  }));
  const names = pieceNames(plan);
  const data = { plan, cuts, ...(names.length && { pieces }) };
  const persist = () => {
    signal.throwIfAborted();
    save(data);
  };
  persist();
  // One call writes the shared set pieces before any cut; the plan is already saved, so Retry keeps it.
  for (let attempt = 0, error; names.length && !data.pieces; attempt++) {
    if (attempt === CUT_ATTEMPTS) throw piecesError(error.message);
    let raw;
    try {
      raw = await write(
        PIECES_INSTRUCTIONS,
        JSON.stringify({
          styleBrief: plan.styleBrief,
          names,
          ...(error && { validationError: error.message }),
        }),
      );
    } catch (e) {
      if (!e.invalidOutput) throw e;
      error = e;
      continue;
    }
    try {
      data.pieces = cutSource(raw, plan.styleBrief, names);
    } catch (e) {
      error = e;
    }
  }
  if (data.pieces && !pieces) {
    persist();
    await onPieces(data.pieces, names);
  }
  // Each audit shares its pre-audit last frame with the next cut's audit, so audits never wait on each other.
  const lastFrames = cuts.map(() => Promise.withResolvers());
  // Narration depends only on the plan, never on a cut writer or a neighbouring cut finishing.
  const attempts = cuts.map(() => 0);
  const writerInstructions = (index) =>
    cuts[index].engine === 'manim'
      ? MANIM_INSTRUCTIONS
      : CUT_INSTRUCTIONS + (plan.cuts[index].dimension === '3d' ? CUT_3D : '');
  const rewrite = async (index, reason) => {
    let error = reason && new Error(reason),
      failed = reason && cuts[index].code;
    while (attempts[index] < CUT_ATTEMPTS) {
      attempts[index]++;
      // A repair is also the cut's audit, so it sees the failed code and the previous cut's last frame.
      const previous = error && index ? await lastFrames[index - 1].promise : null;
      signal.throwIfAborted();
      // Provider/auth failures are final; only validation/render failures spend a repair attempt.
      let raw;
      try {
        raw = await write(
          writerInstructions(index) + (error ? REPAIR_NOTE : ''),
          JSON.stringify({
            styleBrief: plan.styleBrief,
            cut: plan.cuts[index],
            previousEndState: index ? plan.cuts[index - 1].endState : null,
            ...(data.pieces && cuts[index].engine !== 'manim' && { setPieces: data.pieces }),
            ...(error && {
              validationError: error.message,
              ...(failed && { failedCode: failed }),
              previousLastFrame: !!previous,
            }),
          }),
          undefined,
          previous ? [previous] : undefined,
        );
      } catch (e) {
        if (!e.invalidOutput) throw e;
        error = e;
        failed = null;
        continue;
      }
      failed = raw;
      try {
        cuts[index].code =
          cuts[index].engine === 'manim' ? unfenced(raw) : cutSource(raw, plan.styleBrief);
      } catch (e) {
        error = e;
        continue;
      }
      // A Manim cut is validated in the render sandbox as soon as it is written, before narration or render.
      if (cuts[index].engine === 'manim' && check)
        try {
          await mkdir(join(workspace, `cut-${index}`), { recursive: true, mode: 0o700 });
          await check(await stage(index));
        } catch (e) {
          signal.throwIfAborted();
          if (e.manimUnavailable) throw e;
          error = new Error(
            withoutPaths(
              e.message === 'Video rendering failed.' ? (e.diagnostic ?? e.message) : e.message,
            ),
          );
          continue;
        }
      // New code makes any earlier Manim clip stale.
      delete cuts[index].clip;
      if (error) cuts[index].audited = true;
      persist();
      return;
    }
    throw cutError(error.message, index, plan.cuts.length);
  };
  const stage = async (index) => {
    const dir = join(workspace, `cut-${index}`);
    if (cuts[index].engine === 'manim') {
      await writeFile(join(dir, 'Cut.py'), cuts[index].code);
      await writeFile(join(dir, 'kit.py'), manimKit);
      await writeFile(
        join(dir, 'brief.json'),
        JSON.stringify({
          palette: Object.fromEntries(
            Object.entries(videoPalette).filter(
              ([ink]) =>
                !['amber', 'leaf', 'rust', 'lichen'].includes(ink) ||
                Object.values(plan.styleBrief.paletteRoles).includes(ink),
            ),
          ),
          colors: Object.fromEntries(
            Object.entries(plan.styleBrief.paletteRoles).map(([role, ink]) => [
              role,
              videoPalette[ink],
            ]),
          ),
        }),
      );
    }
    await writeFile(
      join(dir, 'Video.tsx'),
      cuts[index].engine === 'manim' ? MANIM_COMPONENT : cuts[index].code,
    );
    await writeFile(join(dir, 'index.tsx'), CUT_ENTRY);
    if (data.pieces && cuts[index].engine !== 'manim')
      await writeFile(join(dir, 'pieces.tsx'), data.pieces);
    await writeFile(
      join(dir, 'emphasis.json'),
      JSON.stringify(cuts[index].emphasis ?? plan.cuts[index].emphasis ?? []),
    );
    await writeFile(
      join(dir, 'kit.tsx'),
      kit +
        '\nexport const colors = {\n' +
        Object.entries(plan.styleBrief.paletteRoles)
          .map(([role, ink]) => `  ${JSON.stringify(role)}: palette.${ink},`)
          .join('\n') +
        '\n};\n',
    );
    return dir;
  };
  // A Manim clip is rendered into the staged cut's public folder, where its wrapper and snapshots read it.
  const clipOf = async (index) => {
    await clip(await stage(index), cuts[index].timing.durationInFrames);
    cuts[index].clip = `cut-${index}/public/manim.mp4`;
    persist();
  };
  // Stills at each sentence end and the narration's last frame, rendered from the staged cut.
  const shoot = async (index) => {
    const dir = await stage(index),
      { sentences, audioFrames } = cuts[index].timing;
    const frames = [
      ...new Set([...sentences.map((s) => Math.min(s.endFrame, audioFrames)), audioFrames]),
    ].map((f) => Math.max(0, f - 1));
    const stills = frames.map((frame) => ({
      frame,
      file: join(dir, 'out', randomUUID() + '.jpg'),
    }));
    await snapshot(dir, stills, signal);
    signal.throwIfAborted();
    const out = await realpath(join(dir, 'out'));
    for (const { file } of stills) {
      const stat = await lstat(file).catch(() => null);
      if (
        !stat?.isFile() ||
        !stat.size ||
        stat.size > 2 * 1024 * 1024 ||
        (await realpath(file)) !== join(out, file.slice(file.lastIndexOf('/') + 1))
      )
        throw new Error('Video snapshot is unreadable.');
    }
    return stills.map(({ file }) => ({ path: file, type: 'image/jpeg' }));
  };
  const audit = async (index) => {
    const cut = cuts[index];
    let own = null;
    try {
      own = await shoot(index);
    } catch {
      signal.throwIfAborted();
    } finally {
      lastFrames[index].resolve(own?.at(-1) ?? null);
    }
    const before = { code: cut.code, emphasis: cut.emphasis };
    // An audit only improves a cut: no frames, an unusable answer or a fix that will not render keeps the cut as it was.
    if (own?.length && !cut.audited)
      try {
        const previous = index ? await lastFrames[index - 1].promise : null;
        signal.throwIfAborted();
        const task = {
          styleBrief: plan.styleBrief,
          cut: plan.cuts[index],
          previousEndState: index ? plan.cuts[index - 1].endState : null,
          ...(data.pieces && cut.engine !== 'manim' && { setPieces: data.pieces }),
          code: cut.code,
          emphasis: cut.emphasis ?? plan.cuts[index].emphasis ?? [],
          previousLastFrame: !!previous,
        };
        const issues = auditIssues(
          await call(
            cut.engine === 'manim' ? MANIM_AUDIT_INSTRUCTIONS : AUDIT_INSTRUCTIONS,
            JSON.stringify({ ...task, snapshots: own.length }),
            undefined,
            previous ? [...own, previous] : own,
          ),
        );
        if (issues) {
          // The chat model rewrites the flagged cut once; the fix is kept only if it validates and renders.
          Object.assign(
            cut,
            auditFix(
              await write(
                writerInstructions(index) + FIX_NOTE,
                JSON.stringify({ ...task, issues }),
                undefined,
                previous ? [previous] : undefined,
              ),
              plan.styleBrief,
              cut.timing.sentences.length,
              cut.engine,
            ),
          );
          // A Manim fix is checked and rendered to a new clip; the old clip is replaced only on success.
          if (cut.engine !== 'manim') await shoot(index);
          else {
            if (check) await check(await stage(index));
            await clipOf(index);
          }
        }
      } catch {
        signal.throwIfAborted();
        Object.assign(cut, before);
        if (before.emphasis === undefined) delete cut.emphasis;
      }
    cut.audited = true;
    persist();
  };
  const writing = cuts.map(async (cut, index) => {
    const dir = join(workspace, `cut-${index}`);
    cut.status = 'writing';
    persist();
    const operations = [
      cut.code ? null : rewrite(index),
      (async () => {
        if (cut.timing) {
          await mkdir(join(dir, 'out'), { recursive: true, mode: 0o700 });
          return mkdir(join(dir, 'tmp'), { recursive: true, mode: 0o700 });
        }
        const narration = await wait(
          narrate(plan.cuts[index].narration, signal),
          120000 + plan.cuts[index].narration.length * 30,
          'Video narration timed out.',
        );
        await mkdir(join(dir, 'out'), { recursive: true, mode: 0o700 });
        await mkdir(join(dir, 'tmp'), { mode: 0o700 });
        const timing = await stageNarration(dir, narration, signal);
        cut.timing = {
          ...timing,
          audioFrames: timing.durationInFrames,
          durationInFrames: timing.durationInFrames + CUT_PAUSE_FRAMES,
          entry: index > 0 ? cutJoin(plan.cuts[index]) : null,
          // The last cut fades out at the end of the video.
          exit: index < plan.cuts.length - 1 ? cutJoin(plan.cuts[index + 1]) : cutJoin({}),
        };
        await writeFile(join(dir, 'narration.json'), JSON.stringify(cut.timing));
        const publicTiming = JSON.parse(await readFile(join(dir, 'public', 'timing.json')));
        await writeFile(
          join(dir, 'public', 'timing.json'),
          JSON.stringify({ ...publicTiming, ...cut.timing }),
        );
        persist();
      })(),
    ];
    try {
      await Promise.all(operations);
      // A Manim cut renders before its audit, which sees frames of the clip; a failed render spends the repair.
      while (cut.engine === 'manim' && !cut.clip)
        try {
          await clipOf(index);
        } catch (e) {
          signal.throwIfAborted();
          if (e.manimUnavailable || e.code) throw e;
          const reason = withoutPaths(e.diagnostic ?? e.message);
          if (attempts[index] >= CUT_ATTEMPTS) throw cutError(reason, index, plan.cuts.length);
          await rewrite(index, reason);
        }
      await audit(index);
    } catch (error) {
      if (!signal.aborted) {
        cut.status = 'failed';
        persist();
      }
      stop(error);
      // A failed writer may race with audio staging. Drain both before removing private files.
      await Promise.allSettled(operations);
      throw error;
    } finally {
      lastFrames[index].resolve(null);
    }
    cut.status = 'written';
    persist();
  });
  try {
    await Promise.all(writing);
  } catch (error) {
    stop(error);
    await Promise.allSettled(writing);
    // Siblings fail with AbortError once one cut stops the job; report the first real cause.
    throw signal.reason ?? error;
  }
  return { data, attempts, rewrite, stage, persist, clip: clipOf };
}
