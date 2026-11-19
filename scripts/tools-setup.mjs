import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { projectRoot, texBin, uvDir } from '../server/media/manim.mjs';

export const UV_VERSION = '0.13.9';
const UV_TARGETS = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
};
// shortcut: TinyTeX's rolling "daily" bundle, because tlmgr installs from the current CTAN year anyway and a pinned older bundle stops working at the next TeX Live release.
const TINYTEX = {
  'linux-x64': 'linux-x86_64',
  'linux-arm64': 'linux-arm64',
  'darwin-x64': 'darwin',
  'darwin-arm64': 'darwin',
  'win32-x64': 'windows',
};
// Manim's documented minimal LaTeX packages (docs.manim.community, installation).
export const MANIM_TEX_PACKAGES = (
  'amsmath babel-english cbfonts-fd cm-super count1to ctex doublestroke dvisvgm everysel ' +
  'fontspec frcursive fundus-calligra gnu-freefont jknapltx latex-bin mathastext microtype ' +
  'multitoc physics preview prelim2e ragged2e relsize rsfs setspace standalone tipa wasy ' +
  'wasysym xcolor xetex xkeyval'
).split(' ');

async function download(url, file, report, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length')) || null;
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(response.body),
    async function* (chunks) {
      for await (const chunk of chunks) {
        bytes += chunk.length;
        report({ bytes, total, percent: total && (bytes / total) * 100 });
        yield chunk;
      }
    },
    createWriteStream(file),
  );
  return { bytes, total };
}

// Unpacks beside the target and renames, so an interrupted download leaves no half tool behind.
// `extract` fills the part folder and returns an exit code; `inner` names the archive's top folder, if it keeps one.
async function unpack(url, dir, { report, signal, name, extract, inner = '' }) {
  const part = `${dir}.part`,
    archive = `${dir}.download${extname(url)}`;
  rmSync(part, { recursive: true, force: true });
  mkdirSync(part, { recursive: true });
  let size;
  try {
    size = await download(url, archive, report, signal).catch((error) => {
      if (signal?.aborted) throw error;
      throw new Error(
        `${name} download failed (${error.message}). Check your connection and Retry.`,
      );
    });
    if (await extract(archive, part))
      throw new Error(`${name} could not be unpacked. Retry the download.`);
  } finally {
    rmSync(archive, { force: true });
  }
  rmSync(dir, { recursive: true, force: true });
  renameSync(join(part, inner), dir);
  rmSync(part, { recursive: true, force: true });
  return size;
}

const untar = (run, strip) => (archive, part) =>
  run('tar', ['-xf', archive, '-C', part, ...(strip ? ['--strip-components', '1'] : [])]);

const target = (table, platform, arch, name) => {
  const found = table[`${platform}-${arch}`];
  if (!found)
    throw new Error(`${name} downloads support Linux, macOS and Windows on x64 or arm64.`);
  return found;
};
const found = (probe, command) => probe(command, ['--version'], { timeout: 10000 }).status === 0;

export const uvReady = ({ probe = spawnSync } = {}) => found(probe, 'uv');
export const latexReady = ({ probe = spawnSync } = {}) =>
  found(probe, 'latex') && found(probe, 'dvisvgm');

// uv from its official release, into .tools/uv, when none is on PATH.
export async function ensureUv({
  run,
  root = projectRoot,
  probe = spawnSync,
  platform = process.platform,
  arch = process.arch,
  report = () => {},
  signal,
  log = console.log,
}) {
  if (uvReady({ probe })) return;
  const windows = platform === 'win32';
  // The Windows zip holds uv.exe at its root; the tarballs keep one top folder.
  const asset = `uv-${target(UV_TARGETS, platform, arch, 'uv')}.${windows ? 'zip' : 'tar.gz'}`;
  log(`Downloading uv ${UV_VERSION}. Internet access is needed.`);
  const dir = uvDir(root);
  mkdirSync(dirname(dir), { recursive: true });
  await unpack(`https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${asset}`, dir, {
    report,
    signal,
    name: 'uv',
    extract: untar(run, !windows),
  });
  if (!found(probe, join(dir, 'uv')))
    throw new Error('Downloaded uv does not run. Retry the download.');
}

// TinyTeX plus Manim's LaTeX packages, into .tools/TinyTeX, when latex or dvisvgm is missing.
export async function ensureLatex({
  run,
  root = projectRoot,
  probe = spawnSync,
  platform = process.platform,
  arch = process.arch,
  report = () => {},
  signal,
  log = console.log,
}) {
  if (latexReady({ probe })) return;
  const bin = texBin(root, platform, arch),
    dir = dirname(dirname(bin)),
    windows = platform === 'win32';
  // Windows tlmgr is a .bat, which spawn cannot run without a shell, so call the Perl script it wraps.
  const [tlmgr, tlmgrArgs] = windows
    ? [
        join(dir, 'tlpkg', 'tlperl', 'bin', 'perl.exe'),
        [join(dir, 'texmf-dist', 'scripts', 'texlive', 'tlmgr.pl')],
      ]
    : [join(bin, 'tlmgr'), []];
  // A bundle already unpacked only needs its packages, so Retry after a failed tlmgr skips the download.
  if (!existsSync(tlmgr)) {
    const bundle = `TinyTeX-1-${target(TINYTEX, platform, arch, 'LaTeX')}.${windows ? 'exe' : 'tar.xz'}`;
    log('Downloading LaTeX (TinyTeX). Internet access is needed.');
    mkdirSync(dirname(dir), { recursive: true });
    const size = await unpack(
      `https://github.com/rstudio/tinytex-releases/releases/download/daily/${bundle}`,
      dir,
      {
        report,
        signal,
        name: 'LaTeX',
        // The Windows bundle is a 7-Zip self-extractor holding one TinyTeX folder.
        extract: windows ? (archive, part) => run(archive, ['-y', `-o${part}`]) : untar(run, true),
        inner: windows ? 'TinyTeX' : '',
      },
    );
    // Package installs report no bytes, so the bar turns indeterminate while tlmgr runs.
    report({ ...size, percent: null });
  }
  log("Installing Manim's LaTeX packages with tlmgr.");
  if (await run(tlmgr, [...tlmgrArgs, 'install', ...MANIM_TEX_PACKAGES]))
    throw new Error('LaTeX package install failed. Check your connection and Retry.');
  if (!['latex', 'dvisvgm'].every((tool) => existsSync(join(bin, windows ? `${tool}.exe` : tool))))
    throw new Error('LaTeX install is incomplete. Retry the download.');
}
