import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempDisposableSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { cliInstaller } from '../../server/providers/install.mjs';

test(
    'Linux installs report script fetch failures and run a successful download',
    { skip: process.platform === 'win32' },
    async (t) => {
        const dir = mkdtempDisposableSync(join(tmpdir(), 'rabbithole-install-'));
        t.after(dir.remove);
        const curl = join(dir.path, 'curl');
        writeFileSync(curl, '#!/bin/sh\necho "Could not fetch installer" >&2\nexit 6\n', {
            mode: 0o700,
        });
        const logs = [];
        const installer = cliInstaller('codex', {
            platform: 'linux',
            env: { PATH: [dir.path, '/usr/bin', '/bin'].join(delimiter) },
            log: (line) => logs.push(line),
        });
        await assert.rejects(installer.run({}), { message: 'Could not fetch installer' });
        writeFileSync(
            curl,
            '#!/bin/sh\ncat <<\'SCRIPT\'\ntest "$CODEX_NON_INTERACTIVE" = 1 || exit 1\necho "Installer ran"\nSCRIPT\n',
        );
        await installer.run({});
        assert.match(logs.at(-1), /Installer ran$/);
    },
);
