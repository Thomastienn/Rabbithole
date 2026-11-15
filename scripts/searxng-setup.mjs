import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFile, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

// Upstream publishes rolling snapshots rather than tagged releases.
export const SEARXNG_REVISION = 'a7128d5d1d5af2837a68fbeaaee9c3e8391aa9cf';
export const SEARXNG_SOURCE = `https://github.com/searxng/searxng/archive/${SEARXNG_REVISION}.tar.gz`;

export function runSetup(command, args, options) {
  return new Promise((resolve, reject) =>
    execFile(
      command,
      args,
      { timeout: 300000, maxBuffer: 1024 * 1024, ...options },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`${command}: ${stderr?.trim().slice(-2000) || error.message}`));
        else resolve(0);
      },
    ),
  );
}

export async function ensureSearxng({
  dir,
  run = runSetup,
  probe = spawnSync,
  signal,
  log = console.log,
}) {
  const root = join(dir, 'searxng');
  const venv = join(root, 'venv');
  const python = join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const settings = join(root, 'settings.yml');
  try {
    signal?.throwIfAborted();
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const cache = join(root, 'cache');
    mkdirSync(cache, { recursive: true, mode: 0o700 });
    let secret;
    try {
      secret = JSON.parse(readFileSync(settings, 'utf8')).server.secret_key;
    } catch {}
    if (!/^[a-f0-9]{64}$/.test(secret ?? '')) secret = randomBytes(32).toString('hex');
    // JSON is YAML; regenerate owned settings so inherited/debug bindings cannot expose the service.
    writeFileSync(
      settings,
      JSON.stringify(
        {
          use_default_settings: true,
          general: { debug: false },
          search: { formats: ['html', 'json'] },
          server: {
            secret_key: secret,
            bind_address: '127.0.0.1',
            port: 0,
            limiter: false,
            public_instance: false,
          },
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    chmodSync(settings, 0o600);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.startsWith('SEARXNG_') && !key.startsWith('PYTHON'),
      ),
    );
    Object.assign(env, { SEARXNG_SETTINGS_PATH: settings, TMPDIR: cache });
    const options = { cwd: root, env, signal };
    const installed = () =>
      probe(
        python,
        [
          '-c',
          `import json, importlib.metadata as m; assert json.loads(m.distribution('searxng').read_text('direct_url.json'))['url'] == ${JSON.stringify(SEARXNG_SOURCE)}; import searx`,
        ],
        { ...options, timeout: 10000, encoding: 'utf8' },
      ).status === 0;
    if (!installed()) {
      if (probe('uv', ['--version'], { timeout: 10000 }).status !== 0)
        throw new Error(
          'Install uv (https://docs.astral.sh/uv/getting-started/installation/), then restart npm start.',
        );
      log(
        `Installing SearXNG ${SEARXNG_REVISION.slice(0, 9)} in ${venv} with uv. Internet access may be needed on first run.`,
      );
      const uv = async (args) => {
        signal?.throwIfAborted();
        if (await run('uv', args, options)) throw new Error(`uv ${args.join(' ')} failed.`);
      };
      if (!existsSync(python)) await uv(['venv', '--python', '3.12', venv]);
      // setup.py imports these before declaring install_requires; upstream needs no-build-isolation.
      await uv([
        'pip',
        'install',
        '--python',
        python,
        'setuptools==84.2.1',
        'pyyaml==6.0.3',
        'msgspec==0.22.0',
        'typing-extensions==4.16.0',
      ]);
      await uv(['pip', 'install', '--python', python, '--no-build-isolation', SEARXNG_SOURCE]);
      if (!installed())
        throw new Error(
          'The installed SearXNG could not be imported or its pinned source did not match.',
        );
    }
    return { ready: true, python, options };
  } catch (error) {
    return {
      ready: false,
      error: `SearXNG unavailable: ${error.message} Check network access and write access to ${root}, then restart npm start.`,
    };
  }
}
