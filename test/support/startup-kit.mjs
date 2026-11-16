import { spawn } from 'node:child_process';
import { processOutput } from './process-output.mjs';

export function launch(
  dir,
  port = 0,
  env = {},
  cwd = process.cwd(),
  command = ['server/main.mjs'],
) {
  const child = spawn(process.execPath, command, {
    cwd,
    env: {
      ...process.env,
      PATH: dir,
      RABBITHOLE_DATA_DIR: dir,
      RABBITHOLE_PORT: String(port),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const { exited, waitFor, output } = processOutput(child);
  return {
    child,
    exited,
    waitFor,
    output,
    stop: async () => {
      if (child.exitCode === null) child.kill('SIGTERM');
      await exited;
    },
  };
}
