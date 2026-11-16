import { spawn as spawnProcess } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { projectRoot } from '../media/manim.mjs';

export const PYTHON_PACKAGES = ['numpy==2.5.4', 'scipy==1.18.1', 'sympy==1.14.0', 'pandas==3.1.1'];
export const pythonVenv = (root = projectRoot) => join(root, '.venv-python');
export const OUTPUT_LIMIT = 20000;
export const pythonWorkspace = (dir, conversation) => join(dir, 'python', String(conversation));

export const PYTHON_SETUP =
  'Offline Python needs bubblewrap and its own Python environment. On Linux run: sudo apt install bubblewrap, then restart with npm start, which installs numpy, scipy, sympy and pandas into .venv-python with uv.';

function probe(command, args) {
  return new Promise((resolve) => {
    // AbortSignal, not `timeout`: spawn keeps its timeout timer alive after ENOENT, delaying exit 30 s.
    const child = spawnProcess(command, args, {
      stdio: 'ignore',
      signal: AbortSignal.timeout(30000),
    });
    child.once('error', () => resolve(false));
    child.once('close', (code) => resolve(code === 0));
  });
}

// Ready only when bubblewrap and the dedicated venv with every package exist.
export async function detectPython({ root = projectRoot, check = probe } = {}) {
  const python = join(pythonVenv(root), 'bin', 'python');
  if (process.platform !== 'linux' || !(await check('bwrap', ['--version'])))
    return { ready: false, python, bwrap: false, error: `bubblewrap is missing. ${PYTHON_SETUP}` };
  if (!(await check(python, ['-I', '-c', 'import numpy, scipy, sympy, pandas'])))
    return { ready: false, python, error: `The Python environment is missing. ${PYTHON_SETUP}` };
  return { ready: true, python };
}

// Model-written code: no network, empty home, read-only system, app data hidden, only the workspace writable.
export function pythonSandbox(workspace, python, dataDir) {
  const runtime = dirname(dirname(realpathSync(python))),
    venv = dirname(dirname(python));
  return [
    '--ro-bind', '/', '/',
    '--tmpfs', homedir(),
    '--tmpfs', dataDir,
    '--tmpfs', '/tmp',
    '--tmpfs', '/run/user',
    '--ro-bind', runtime, runtime,
    '--ro-bind', venv, venv,
    '--bind', workspace, workspace,
    '--chdir', workspace,
    '--unshare-all',
    '--die-with-parent',
    '--new-session',
    '--dev', '/dev',
    '--proc', '/proc',
    '--clearenv',
    '--setenv', 'PATH', `${join(venv, 'bin')}:/usr/bin:/bin`,
    '--setenv', 'HOME', workspace,
    '--setenv', 'TMPDIR', '/tmp',
    '--setenv', 'MPLBACKEND', 'Agg',
    python, '-I', '-B', '-',
  ]; // prettier-ignore
}

// Keeps the first OUTPUT_LIMIT characters of a stream and counts the rest.
function capture(stream) {
  const state = { text: '', dropped: 0 };
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const room = OUTPUT_LIMIT - state.text.length;
    state.text += chunk.slice(0, Math.max(0, room));
    state.dropped += Math.max(0, chunk.length - Math.max(0, room));
  });
  return state;
}
const shown = ({ text, dropped }) =>
  text + (dropped ? `\n[… output truncated: ${dropped} more characters]` : '');

// One fresh sandboxed process per call; workspace files persist for the conversation.
export async function runPython(
  { code, timeout = 60 },
  { workspace, python, dataDir, signal, spawn = spawnProcess },
) {
  if (typeof code !== 'string' || !code.trim()) throw new Error('run_python needs Python code.');
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600)
    throw new Error('run_python timeout must be a whole number of seconds from 1 to 600.');
  signal?.throwIfAborted();
  mkdirSync(workspace, { recursive: true, mode: 0o700 });
  const child = spawn('bwrap', pythonSandbox(workspace, python, dataDir), {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {},
  });
  const out = capture(child.stdout),
    err = capture(child.stderr);
  let timedOut = false;
  const kill = () => child.kill('SIGKILL');
  const timer = setTimeout(() => {
    timedOut = true;
    kill();
  }, timeout * 1000);
  signal?.addEventListener('abort', kill, { once: true });
  child.stdin.on('error', () => {});
  child.stdin.end(code);
  const exit = await new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('run_python could not start bubblewrap.')));
    child.once('close', (status) => resolve(status));
  }).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', kill);
  });
  signal?.throwIfAborted();
  return [
    timedOut
      ? `Stopped: the time limit of ${timeout} seconds was reached.`
      : `Exit code: ${exit ?? 'killed'}`,
    '--- stdout ---',
    shown(out),
    '--- stderr ---',
    shown(err),
  ].join('\n');
}

// Status is probed lazily and kept once ready; a missing setup is re-checked on the next turn.
export function pythonTool({ dir, root, check, spawn } = {}) {
  let ready;
  const status = async () => {
    if (ready) return ready;
    const result = await detectPython({ root, check });
    if (result.ready) ready = result;
    return result;
  };
  return {
    status,
    async run(input, turn) {
      const { ready: ok, python, error } = await status();
      if (!ok) throw new Error(error);
      return runPython(input, {
        workspace: pythonWorkspace(dir, turn.conversation),
        python,
        dataDir: dir,
        signal: turn.signal,
        spawn,
      });
    },
  };
}
