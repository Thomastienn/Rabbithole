import { spawn } from 'node:child_process';

// The official installers (ADR 0024): PowerShell on Windows, a shell pipe elsewhere; none needs admin rights.
const INSTALLERS = {
    claude: {
        name: 'Claude Code',
        win32: 'irm https://claude.ai/install.ps1 | iex',
        posix: 'curl -fsSL https://claude.ai/install.sh | bash',
    },
    codex: {
        name: 'Codex',
        win32: 'irm https://chatgpt.com/codex/install.ps1 | iex',
        posix: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
    },
};

export const installable = (cli) => Object.hasOwn(INSTALLERS, cli);

// The command a learner pastes: Claude's script into PowerShell, Codex's from any Windows prompt.
export function installCommand(cli, platform = process.platform) {
    const { win32, posix } = INSTALLERS[cli];
    if (platform !== 'win32') return posix;
    return cli === 'codex' ? `powershell -ExecutionPolicy ByPass -c "${win32}"` : win32;
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

// A download-manager tool that runs the installer without a terminal; output goes to the server log,
// and a failure carries the installer's last output line.
export function cliInstaller(
    cli,
    { platform = process.platform, run = spawn, log = console.log, env = process.env } = {},
) {
    const { name, win32, posix } = INSTALLERS[cli];
    const [command, args] =
        platform === 'win32'
            ? ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'ByPass', '-Command', win32]]
            : ['sh', ['-c', posix]];
    return {
        id: cli,
        name,
        run: ({ signal }) =>
            new Promise((resolve, reject) => {
                let last = '';
                const child = run(command, args, {
                    env: { ...env, CODEX_NON_INTERACTIVE: '1' },
                    stdio: ['ignore', 'pipe', 'pipe'],
                    windowsHide: true,
                    signal,
                });
                const lines = (chunk) => {
                    for (const line of String(chunk)
                        .replace(ANSI, '')
                        .split(/\r?\n|\r/)) {
                        if (!line.trim()) continue;
                        last = line.trim();
                        log(`${name} install: ${last}`);
                    }
                };
                child.stdout.on('data', lines);
                child.stderr.on('data', lines);
                child.once('error', (error) => reject(new Error(last || error.message)));
                child.once('close', (code) =>
                    code === 0
                        ? resolve()
                        : reject(new Error(last || `${name} install failed (exit ${code}).`)),
                );
            }),
    };
}
