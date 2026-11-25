// The Desktop build workflow's first check: node scripts/install-check.mjs. Installs Claude Code and Codex with the
// app's own installer code, as the Install button does, then checks the tool finder finds each and `--version` runs.
// No sign-in. Any failed step exits non-zero.
import { execFileSync } from 'node:child_process';
import { findCli, launchArgs } from '../server/providers/findCli.mjs';
import { cliInstaller } from '../server/providers/install.mjs';

for (const cli of ['claude', 'codex']) {
    const installer = cliInstaller(cli);
    console.log(`\ninstall-check: installing ${installer.name}`);
    await installer.run({});
    const bin = findCli(cli);
    if (!bin) throw new Error(`The app cannot find ${installer.name} after installing it.`);
    const [command, args] = launchArgs(bin, ['--version']);
    console.log(
        `${bin}: ${execFileSync(command, args, { encoding: 'utf8', timeout: 60_000 }).trim()}`,
    );
}
