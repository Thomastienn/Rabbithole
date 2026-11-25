import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// The official installers (ADR 0024): PowerShell on Windows, a shell pipe elsewhere; none needs admin rights.
const INSTALLERS = {
    claude: {
        name: 'Claude Code',
        url: 'https://claude.ai/install',
        shell: 'bash',
    },
    codex: {
        name: 'Codex',
        url: 'https://chatgpt.com/codex/install',
        shell: 'sh',
    },
};

export const installable = (cli) => Object.hasOwn(INSTALLERS, cli);

// The command a learner pastes: Claude's script into PowerShell, Codex's from any Windows prompt.
export function installCommand(cli, platform = process.platform) {
    const { url, shell } = INSTALLERS[cli];
    if (platform !== 'win32') return `curl -fsSL ${url}.sh | ${shell}`;
    const script = `irm ${url}.ps1 | iex`;
    return cli === 'codex' ? `powershell -ExecutionPolicy ByPass -c "${script}"` : script;
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

// A download-manager tool that runs the installer without a terminal; output goes to the server log,
// and a failure carries the installer's last output line.
export function cliInstaller(
    cli,
    { platform = process.platform, run = spawn, log = console.log, env = process.env } = {},
) {
    const { name, url, shell } = INSTALLERS[cli];
    // An empty pipe can exit successfully after curl fails. Run the script only after a successful fetch.
    const [command, args] =
        platform === 'win32'
            ? [
                  'powershell.exe',
                  [
                      '-NoProfile',
                      '-NonInteractive',
                      '-ExecutionPolicy',
                      'ByPass',
                      '-Command',
                      `$ErrorActionPreference = 'Stop'; irm ${url}.ps1 | iex`,
                  ],
              ]
            : [
                  'sh',
                  [
                      '-c',
                      'script=$(curl -fsSL "$1") && printf "%s\\n" "$script" | "$2"',
                      'install',
                      `${url}.sh`,
                      shell,
                  ],
              ];
    return {
        id: cli,
        name,
        run: ({ signal }) =>
            new Promise((resolve, reject) => {
                let last = '';
                // Windows PowerShell started from PowerShell 7 inherits its module path and then cannot load
                // Get-FileHash, which Claude's installer needs; without it, powershell.exe uses its own default.
                const child = run(command, args, {
                    env: {
                        ...Object.fromEntries(
                            Object.entries(env).filter(
                                ([key]) =>
                                    platform !== 'win32' || key.toLowerCase() !== 'psmodulepath',
                            ),
                        ),
                        CODEX_NON_INTERACTIVE: '1',
                    },
                    stdio: ['ignore', 'pipe', 'pipe'],
                    windowsHide: true,
                    signal,
                });
                for (const input of [child.stdout, child.stderr]) {
                    createInterface({ input, crlfDelay: Infinity }).on('line', (line) => {
                        const text = line.replace(ANSI, '').trim();
                        if (!text) return;
                        last = text;
                        log(`${name} install: ${last}`);
                    });
                }
                child.once('error', (error) => reject(new Error(last || error.message)));
                child.once('close', (code) =>
                    code === 0
                        ? resolve()
                        : reject(new Error(last || `${name} install failed (exit ${code}).`)),
                );
            }),
    };
}
