import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LINUX_PACKAGES, systemPackages, texBin, uvDir } from '../../server/media/manim.mjs';
import {
  ensureLatex,
  ensureUv,
  MANIM_TEX_PACKAGES,
  UV_VERSION,
} from '../../scripts/tools-setup.mjs';

// Fake downloads: fetch answers a 4-byte archive; `tar` writes the given files into the -C folder.
function fixture(t, files = []) {
  const root = mkdtempSync(join(tmpdir(), 'rabbithole-tools-'));
  const fetched = [],
    reports = [],
    calls = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetched.push(url);
    return new Response('data', { headers: { 'content-length': '4' } });
  };
  t.after(() => (globalThis.fetch = saved));
  const run = async (command, args) => {
    calls.push([command, args]);
    if (command === 'tar') {
      const into = args[args.indexOf('-C') + 1];
      for (const file of files) {
        mkdirSync(join(into, file, '..'), { recursive: true });
        writeFileSync(join(into, file), '');
      }
    }
    return 0;
  };
  const probe = (command) => ({ status: command.startsWith(root) && existsSync(command) ? 0 : 1 });
  return { root, fetched, reports, calls, run, probe, report: (r) => reports.push(r) };
}

test('missing uv downloads its pinned official release into .tools/uv and leaves no partial files', async (t) => {
  const f = fixture(t, ['uv']);
  await ensureUv({ ...f, platform: 'linux', arch: 'x64', log: () => {} });
  assert.deepEqual(f.fetched, [
    `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz`,
  ]);
  assert.ok(existsSync(join(uvDir(f.root), 'uv')));
  assert.deepEqual(readdirSync(join(f.root, '.tools')), ['uv']);
  assert.deepEqual(f.reports.at(-1), { bytes: 4, total: 4, percent: 100 });
  // A uv already on PATH means no download.
  await ensureUv({ ...f, probe: () => ({ status: 0 }), run: assert.fail });
  assert.equal(f.fetched.length, 1);
});

test('a failed uv download asks for Retry and installs nothing', async (t) => {
  const f = fixture(t);
  globalThis.fetch = async () => new Response('', { status: 503 });
  await assert.rejects(
    ensureUv({ ...f, platform: 'linux', arch: 'x64', log: () => {} }),
    /uv download failed \(HTTP 503\)\. Check your connection and Retry/,
  );
  assert.equal(existsSync(uvDir(f.root)), false);
});

test("missing LaTeX downloads TinyTeX and installs Manim's packages; Retry after tlmgr fails skips the download", async (t) => {
  const bin = 'bin/x86_64-linux';
  const f = fixture(t, [`${bin}/tlmgr`, `${bin}/latex`]);
  const tlmgr = join(texBin(f.root, 'linux', 'x64'), 'tlmgr');
  let failTlmgr = true;
  const run = async (command, args) => {
    if (command !== tlmgr) return f.run(command, args);
    f.calls.push([command, args]);
    if (failTlmgr) return 1;
    writeFileSync(join(texBin(f.root, 'linux', 'x64'), 'dvisvgm'), '');
    return 0;
  };
  const options = { ...f, run, platform: 'linux', arch: 'x64', log: () => {} };
  await assert.rejects(
    ensureLatex(options),
    /LaTeX package install failed\. Check your connection and Retry/,
  );
  assert.deepEqual(f.fetched, [
    'https://github.com/rstudio/tinytex-releases/releases/download/daily/TinyTeX-1-linux-x86_64.tar.xz',
  ]);
  assert.deepEqual(f.reports.at(-1), { bytes: 4, total: 4, percent: null });
  assert.ok(MANIM_TEX_PACKAGES.includes('dvisvgm'));
  assert.deepEqual(f.calls.at(-1), [tlmgr, ['install', ...MANIM_TEX_PACKAGES]]);
  failTlmgr = false;
  await ensureLatex(options);
  assert.equal(f.fetched.length, 1);
  // System latex and dvisvgm mean no download.
  await ensureLatex({ ...options, probe: () => ({ status: 0 }), run: assert.fail });
});

test('the Linux line shows only when bwrap, pkg-config or Cairo/Pango headers are missing', () => {
  const probe = (missing) => (command) => ({ status: missing.includes(command) ? 1 : 0 });
  const mint = 'ID=linuxmint\nID_LIKE="ubuntu debian"\n';
  assert.equal(systemPackages({ platform: 'linux', probe: probe([]), release: mint }), null);
  for (const missing of [['bwrap'], ['pkg-config']])
    assert.deepEqual(systemPackages({ platform: 'linux', probe: probe(missing), release: mint }), {
      command: LINUX_PACKAGES,
    });
  assert.equal(
    LINUX_PACKAGES,
    'sudo apt install bubblewrap libcairo2-dev libpango1.0-dev pkg-config python3-dev build-essential',
  );
  assert.deepEqual(
    systemPackages({ platform: 'linux', probe: probe(['bwrap']), release: 'ID=debian\n' }),
    {
      command: LINUX_PACKAGES,
    },
  );
  const fedora = systemPackages({
    platform: 'linux',
    probe: probe(['bwrap']),
    release: 'ID=fedora\n',
  });
  assert.match(fedora.words, /bubblewrap, pkg-config, the Cairo and Pango development headers/);
  assert.equal(systemPackages({ platform: 'darwin', probe: probe(['bwrap']) }), null);
});
