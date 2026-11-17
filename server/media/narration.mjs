import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, rename } from 'node:fs/promises';
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

// pause ({id, seconds, sentence}): a clip with its own sound plays after that sentence, so the narration track
// carries silence of the clip's length there and later speech and subtitles shift past it.
export async function stageNarration(workspace, result, signal, pause) {
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
  // Measure the actual file, not word count or the client's bitrate estimate. Remotion ships ffprobe and ffmpeg.
  const { RenderInternals } = await import('@remotion/renderer');
  const binary = (type) =>
    RenderInternals.getExecutablePath({
      type,
      indent: false,
      logLevel: 'error',
      binariesDirectory: null,
    });
  const measure = async () => {
    const { stdout } = await run(
      binary('ffprobe'),
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audio],
      { signal, timeout: 10000, maxBuffer: 4096 },
    );
    const duration = Number(JSON.parse(stdout).format?.duration);
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error('Video narration is unreadable.');
    return duration;
  };
  let duration = await measure();
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
  let silence;
  if (pause) {
    const atMs = sentences[Math.min(pause.sentence, sentences.length - 1)].endMs,
      frames = Math.max(1, Math.round(pause.seconds * 30)),
      at = (atMs / 1000).toFixed(3),
      length = (frames / 30).toFixed(3);
    const spliced = join(assets, 'spliced.mp3');
    await run(
      binary('ffmpeg'),
      [
        '-v',
        'error',
        '-y',
        '-i',
        audio,
        '-filter_complex',
        `[0:a]atrim=0:${at},asetpts=PTS-STARTPTS[a];[0:a]atrim=start=${at},asetpts=PTS-STARTPTS[b];anullsrc=r=24000:cl=mono,atrim=0:${length}[s];[a][s][b]concat=n=3:v=0:a=1`,
        '-ar',
        '24000',
        '-ac',
        '1',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '48k',
        spliced,
      ],
      { signal, timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    await rename(spliced, audio);
    duration = await measure();
    const shift = (frames * 1000) / 30;
    for (const t of [...sentences, ...words])
      if (t.startMs >= atMs) {
        t.startMs += shift;
        t.endMs += shift;
        t.startFrame = Math.floor((t.startMs * 30) / 1000);
        t.endFrame = Math.ceil((t.endMs * 30) / 1000);
      }
    silence = { id: pause.id, startFrame: Math.round((atMs * 30) / 1000), frames };
  }
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
  const metadata = {
    fps: 30,
    durationInFrames: Math.ceil(duration * 30),
    sentences,
    captions,
    ...(silence && { pause: silence }),
  };
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
