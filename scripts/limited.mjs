// Runs a command inside one shared systemd slice, so every local test run together stays
// under one memory and CPU limit, however many run at once. CI runners have no limit.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SLICE = 'rabbithole-tests.slice';
const LIMITS = ['MemoryHigh=5G', 'MemorySwapMax=2G', 'CPUQuota=200%'];

export function runLimited(command, args) {
    const run = (cmd, argv) => spawnSync(cmd, argv, { stdio: 'inherit' }).status ?? 1;
    if (process.env.CI) return run(command, args);
    if (run('systemctl', ['--user', 'set-property', '--runtime', SLICE, ...LIMITS]) !== 0) {
        console.error(`Could not set the limits on ${SLICE}; tests need a systemd user session.`);
        return 1;
    }
    return run('systemd-run', ['--user', '--scope', '-q', `--slice=${SLICE}`, command, ...args]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    process.exit(runLimited(process.argv[2], process.argv.slice(3)));
