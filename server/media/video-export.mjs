import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { stageCut } from './video-stage.mjs';
import { withoutPaths } from './video-sandbox.mjs';
import { KIT, MANIM_KIT, sandboxRender, validateOutput, mediaPath } from './videos.mjs';

// Renders a saved video's cuts, concatenates them and keeps the MP4 at mediaPath (ADR 0012).
// It never rewrites cut code: the learner already watched this version, so a failure only ends the export.
export async function exportVideo({
  dir,
  id,
  attempt,
  source,
  signal,
  render = sandboxRender,
  onProgress = () => {},
}) {
  const data = JSON.parse(source),
    { plan, cuts } = data;
  const workspace = join(dir, 'video-work', id, attempt);
  const folders = [workspace, ...cuts.map((_, i) => join(workspace, `cut-${i}`))];
  const total = cuts.reduce((n, c) => n + c.timing.durationInFrames, 0);
  const rendered = async (folder, frames, progress) => {
    await mkdir(join(folder, 'out'), { recursive: true, mode: 0o700 });
    const output = join(folder, 'out', randomUUID() + '.mp4');
    const result = await render(folder, output, signal, progress);
    signal.throwIfAborted();
    await validateOutput(folder, output);
    if (result?.fps !== 30 || result.durationInFrames !== frames)
      throw new Error('Rendered video is unreadable.');
    return output;
  };
  try {
    const outputs = [];
    for (const [i, cut] of cuts.entries()) {
      signal.throwIfAborted();
      // Staged again from saved source: the folder's Video.tsx can hold a rejected audit fix.
      const cutDir = await stageCut({
        dir: folders[i + 1],
        cut,
        plan,
        pieces: data.pieces,
        kit: KIT,
        manimKit: MANIM_KIT,
        emphasis: cut.emphasis ?? plan.cuts[i].emphasis ?? [],
        exhibits: (data.exhibits ?? []).filter((e) => e.cut === i),
      });
      onProgress(i / cuts.length);
      outputs.push(
        await rendered(cutDir, cut.timing.durationInFrames, (p) =>
          onProgress((i + Math.min(1, p)) / cuts.length),
        ),
      );
    }
    let output = outputs[0];
    if (cuts.length > 1) {
      await writeFile(
        join(workspace, 'narration.json'),
        JSON.stringify({ fps: 30, durationInFrames: total }),
      );
      await writeFile(
        join(workspace, 'cuts.json'),
        JSON.stringify(
          outputs.map((file, i) => ({ file, durationInFrames: cuts[i].timing.durationInFrames })),
        ),
      );
      output = await rendered(workspace, total, () => {});
    }
    signal.throwIfAborted();
    await mkdir(join(dir, 'videos'), { recursive: true, mode: 0o700 });
    await rename(output, mediaPath(dir, id));
    onProgress(1);
  } catch (error) {
    signal.throwIfAborted();
    // Renderer diagnostics can name private directories; the learner sees the message without paths.
    throw new Error(withoutPaths(error.message));
  } finally {
    // Keep the saved cuts and their audio; drop render leftovers.
    await Promise.all(
      folders.flatMap((folder) =>
        ['bundle', 'tmp', 'out', '.remotion', 'cuts.json', 'cuts.txt'].map((name) =>
          rm(join(folder, name), { recursive: true, force: true }),
        ),
      ),
    );
  }
}
