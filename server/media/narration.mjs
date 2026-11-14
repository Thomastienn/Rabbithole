import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const run = promisify(execFile);
export async function edgeNarration(script, signal, client) {
  client ??= new (await import('@andresaya/edge-tts')).EdgeTTS();
  // The pinned client's clock-recovery hook otherwise retries a failed handshake.
  client.recoverHandshake = async () => false;
  try {
    return await client.generate(script, 'en-US-AriaNeural', {
      signal,
      timeout: 30000,
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    });
  } catch {
    throw new Error('Video narration failed. Check your connection and Retry.');
  }
}

export async function stageNarration(workspace, result, signal) {
  if (
    !(result?.audio instanceof Uint8Array) ||
    !result.audio.length ||
    result.audio.length > 200 * 1024 * 1024
  )
    throw new Error('Video narration is unreadable.');
  const assets = join(workspace, 'public');
  await mkdir(assets, { mode: 0o700 });
  const audio = join(assets, 'narration.mp3');
  await writeFile(audio, result.audio, { mode: 0o600 });
  // Measure the actual file, not word count or the client's bitrate estimate. Remotion ships ffprobe.
  const { RenderInternals } = await import('@remotion/renderer');
  const binary = RenderInternals.getExecutablePath({
    type: 'ffprobe',
    indent: false,
    logLevel: 'error',
    binariesDirectory: null,
  });
  const { stdout } = await run(
    binary,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audio],
    { signal, timeout: 10000, maxBuffer: 4096 },
  );
  const duration = Number(JSON.parse(stdout).format?.duration);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error('Video narration is unreadable.');
  const timing = (boundaries) => {
    if (!Array.isArray(boundaries) || !boundaries.length)
      throw new Error('Video narration timing is missing.');
    let previous = 0;
    return boundaries.map((b) => {
      const start = b.offset / 10000,
        end = (b.offset + b.duration) / 10000;
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < previous ||
        end <= start ||
        end > duration * 1000 + 100 ||
        typeof b.text !== 'string' ||
        !b.text.trim()
      )
        throw new Error('Video narration timing is unreadable.');
      previous = end;
      return {
        text: b.text,
        startMs: start,
        endMs: end,
        startFrame: Math.floor((start * 30) / 1000),
        endFrame: Math.ceil((end * 30) / 1000),
      };
    });
  };
  const sentences = timing(result.sentenceBoundaries),
    words = timing(result.wordBoundaries);
  const captions = [];
  for (const word of words) {
    const last = captions.at(-1);
    if (
      last &&
      last.text.length + word.text.length < 48 &&
      word.endMs - last.startMs < 3500 &&
      word.startMs - last.endMs < 500 &&
      !/[.!?]$/.test(last.text)
    ) {
      last.text += ' ' + word.text;
      last.endMs = word.endMs;
      last.endFrame = word.endFrame;
    } else captions.push({ ...word });
  }
  const metadata = { fps: 30, durationInFrames: Math.ceil(duration * 30), sentences, captions };
  await writeFile(join(workspace, 'narration.json'), JSON.stringify(metadata));
  await writeFile(join(assets, 'timing.json'), JSON.stringify({ ...metadata, words }));
  const stamp = (ms) => new Date(Math.round(ms)).toISOString().slice(11, 23);
  const escape = (text) =>
    text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replace(/[\r\n]/g, ' ');
  await writeFile(
    join(assets, 'captions.vtt'),
    'WEBVTT\n\n' +
      captions
        .map((c) => `${stamp(c.startMs)} --> ${stamp(c.endMs)}\n${escape(c.text)}\n`)
        .join('\n'),
  );
  return metadata;
}
