import { mkdir, writeFile, readFile, lstat, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  CUT_INSTRUCTIONS,
  CUT_3D,
  EXHIBIT_NOTE,
  AUDIT_INSTRUCTIONS,
  REPAIR_NOTE,
  REPAIR_PATCH_NOTE,
  FIX_NOTE,
  FIX_WHOLE_NOTE,
} from './video-cut.mjs';
import {
  cutJoin,
  cutSource,
  pieceNames,
  CUT_ATTEMPTS,
  CUT_PAUSE_FRAMES,
  MAX_SOURCE,
} from './video-plan.mjs';
import { patched, withSource } from './patches.mjs';
import { unfenced, auditIssues, poorPieces, auditFix } from './audit-answers.mjs';
import { MANIM_INSTRUCTIONS, MANIM_AUDIT_INSTRUCTIONS } from './manim-cut.mjs';
import { REMOTION_SKILL, REMOTION_3D_SKILL, MANIM_SKILL } from './skills.mjs';
import { stageNarration } from './narration.mjs';
import { withoutPaths } from './video-sandbox.mjs';
import { writeSetPieces } from './video-pieces.mjs';

export { auditIssues, poorPieces, auditFix };
import { stageCut } from './video-stage.mjs';

// A cut plays live once its code and measured narration exist and its audit settled; Manim also needs its clip.
export const playable = (cut) =>
  !!(cut.code && cut.timing && cut.audited && (cut.engine !== 'manim' || cut.clip));
// Live rows: a row's state may move back (ready to repairing) while the job phase only moves forward.
export const cutRows = (cuts, plan) =>
  cuts.map((c, i) => ({
    cut: i + 1,
    title: plan.cuts[i].purpose,
    state:
      c.step ??
      (playable(c) ? 'ready' : !c.code ? 'writing' : !c.timing ? 'narrating' : 'auditing'),
  }));

// A cut's final validation or render failure; provider, sign-in and runtime errors keep their own wording.
export const cutError = (reason, index, count) =>
  new Error(
    `Cut ${index + 1} of ${count}: ${withoutPaths(reason).replace(/\.$/, '')}. Retry keeps the other cuts.`,
  );

// cut: the 1-based cut a call serves, passed past the provider's signal for the usage meter only.
export async function videoCall(
  provider,
  selection,
  instructions,
  input,
  signal,
  onText,
  images,
  cut,
) {
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
          } else onText?.(bytes, [...items.values()].join('\n\n'));
        }
        if (event.type === 'status') status = event.status;
      },
      () => {},
      signal,
      cut,
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
  // Looks to each one's top library matches; [] when no embedder is usable.
  matches = async () => [],
  // Library id and audit reason of a saved piece flagged as poor; improves it for future videos only.
  onPoorPiece = async () => {},
  // Fetched exhibits ({id, cut, kind, title, site, url, text?, by?, show?, file?, type?}); files live in their cut folder.
  exhibits = [],
  // Set piece drawing progress while their module streams: { drawing: names, drawn, total }.
  onDrawing = () => {},
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
  const names = plan.cuts.some((c) => c.engine === 'remotion') ? pieceNames(plan) : [];
  const data = {
    plan,
    cuts,
    ...(names.length && { pieces }),
    ...(exhibits.length && { exhibits }),
  };
  const exhibitsOf = (index) => exhibits.filter((e) => e.cut === index);
  // Writers and audits see the cut's fetched exhibits, never the planned ones that may have been dropped.
  const task = (index) => {
    const { exhibits: _planned, ...cut } = plan.cuts[index];
    const shown = exhibitsOf(index).map(({ file, type, url, cut, ...e }) => e);
    return {
      styleBrief: plan.styleBrief,
      // A 3D cut's writer always gets a camera note; the default orbit when the plan gave none.
      cut: cut.dimension === '3d' ? { camera: 'slow orbit around the focus', ...cut } : cut,
      previousEndState: index ? plan.cuts[index - 1].endState : null,
      ...(data.pieces && cuts[index].engine !== 'manim' && { setPieces: data.pieces }),
      ...(shown.length && { exhibits: shown }),
    };
  };
  const persist = () => {
    signal.throwIfAborted();
    save(data);
  };
  persist();
  let choices = null,
    parts = [],
    library = {};
  if (names.length && !data.pieces)
    ({
      source: data.pieces,
      choices,
      parts,
    } = await writeSetPieces({
      plan,
      names,
      write,
      matches,
      signal,
      onDrawing,
    }));
  if (data.pieces && !pieces) {
    persist();
    library = (await onPieces(data.pieces, names, choices, parts)) ?? {};
  }
  // Each audit shares its pre-audit last frame with the next cut's audit, so audits never wait on each other.
  const lastFrames = cuts.map(() => Promise.withResolvers());
  const improving = [],
    flagged = new Set();
  // Narration depends only on the plan, never on a cut writer or a neighbouring cut finishing.
  const attempts = cuts.map(() => 0);
  const writerInstructions = (index) =>
    cuts[index].engine === 'manim'
      ? MANIM_INSTRUCTIONS + '\n\n' + MANIM_SKILL
      : CUT_INSTRUCTIONS +
        '\n\n' +
        REMOTION_SKILL +
        (plan.cuts[index].dimension === '3d' ? CUT_3D + '\n\n' + REMOTION_3D_SKILL : '') +
        (exhibitsOf(index).length ? EXHIBIT_NOTE : '');
  const rewrite = async (index, reason) => {
    let error = reason && new Error(reason),
      failed = reason && cuts[index].code;
    // A live row state only; the job phase still moves forward.
    if (reason) {
      cuts[index].step = 'repairing';
      persist();
    }
    while (attempts[index] < CUT_ATTEMPTS) {
      attempts[index]++;
      // A repair is also the cut's audit, so it sees the failed code and the previous cut's last frame.
      const previous = error && index ? await lastFrames[index - 1].promise : null;
      signal.throwIfAborted();
      // Provider/auth failures are final; only validation/render failures spend a repair attempt.
      let raw;
      try {
        const input = {
          ...task(index),
          ...(error && { validationError: error.message, previousLastFrame: !!previous }),
        };
        const call = (note, text) =>
          write(
            writerInstructions(index) + note,
            text,
            undefined,
            previous ? [previous] : undefined,
            index + 1,
          );
        // A repair of failed code answers a patch; when it does not apply, one whole-source call within this attempt.
        raw =
          error && failed
            ? patched(
                failed,
                await call(REPAIR_PATCH_NOTE, withSource(input, 'failedCode', failed)),
              )
            : null;
        raw ??= await call(
          error ? REPAIR_NOTE : '',
          JSON.stringify({ ...input, ...(error && failed && { failedCode: failed }) }),
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
      delete cuts[index].step;
      if (error) cuts[index].audited = true;
      persist();
      return;
    }
    throw cutError(error.message, index, plan.cuts.length);
  };
  const stage = (index) =>
    stageCut({
      dir: join(workspace, `cut-${index}`),
      cut: cuts[index],
      plan,
      pieces: data.pieces,
      kit,
      manimKit,
      emphasis: cuts[index].emphasis ?? plan.cuts[index].emphasis ?? [],
      exhibits: exhibitsOf(index),
    });
  // A Manim clip is rendered into the staged cut's public folder, where its wrapper and snapshots read it.
  const clipOf = async (index) => {
    await clip(await stage(index), cuts[index].timing.durationInFrames);
    cuts[index].clip = `cut-${index}/public/manim.mp4`;
    persist();
  };
  // The contact sheet, then stills at each sentence end and the narration's last frame, rendered from the staged cut.
  const shoot = async (index) => {
    const dir = await stage(index),
      { sentences, audioFrames } = cuts[index].timing;
    const frames = [
      ...new Set([...sentences.map((s) => Math.min(s.endFrame, audioFrames)), audioFrames]),
    ].map((f) => Math.max(0, f - 1));
    const stills = [{ sheet: true, frame: 0 }, ...frames.map((frame) => ({ frame }))].map((s) => ({
      ...s,
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
        const audited = {
          ...task(index),
          code: cut.code,
          emphasis: cut.emphasis ?? plan.cuts[index].emphasis ?? [],
          previousLastFrame: !!previous,
        };
        const offered =
          cut.engine === 'manim'
            ? []
            : Object.keys(library).filter((n) =>
                new RegExp(`\\b${RegExp.escape(n)}(?:3D)?\\b`).test(cut.code),
              );
        const answer = await call(
          cut.engine === 'manim' ? MANIM_AUDIT_INSTRUCTIONS : AUDIT_INSTRUCTIONS,
          JSON.stringify({
            ...audited,
            ...(offered.length && { libraryPieces: offered }),
            snapshots: own.length - 1,
          }),
          undefined,
          previous ? [...own, previous] : own,
          index + 1,
        );
        // The video keeps the pieces it started with; a flagged piece is improved in the library alongside.
        for (const { name, why } of poorPieces(answer, offered))
          if (!flagged.has(library[name])) {
            flagged.add(library[name]);
            improving.push(onPoorPiece(library[name], why).catch(() => {}));
          }
        const issues = auditIssues(answer);
        if (issues) {
          cut.step = 'fixing';
          persist();
          // The chat model patches the flagged cut once, or writes it whole once when the patch does not apply;
          // the fix is kept only if it validates and renders.
          const fix = (note, text) =>
            write(
              writerInstructions(index) + note,
              text,
              undefined,
              previous ? [previous] : undefined,
              index + 1,
            );
          const { code, ...rest } = audited,
            sentences = cut.timing.sentences.length;
          Object.assign(
            cut,
            auditFix(
              await fix(FIX_NOTE, withSource({ ...rest, issues }, 'code', code)),
              plan.styleBrief,
              sentences,
              cut.engine,
              code,
            ) ??
              auditFix(
                await fix(FIX_WHOLE_NOTE, JSON.stringify({ ...audited, issues })),
                plan.styleBrief,
                sentences,
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
    delete cut.step;
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
        const loud = exhibitsOf(index).find((e) => e.sound);
        const timing = await stageNarration(
          dir,
          narration,
          signal,
          loud && { id: loud.id, seconds: loud.seconds, sentence: loud.sentence },
        );
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
  return { data, attempts, rewrite, stage, persist, clip: clipOf, improving };
}
