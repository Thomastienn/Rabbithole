import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { mediaPath } from '../../server/media/videos.mjs';
import { fixture, snapshot } from '../support/chat-management-kit.mjs';

test('process exit before or after commit recovers staged artifact files according to the SQLite transaction', async () => {
    for (const committed of [false, true]) {
        const env = await fixture(),
            before = snapshot(env.store);
        const files = [env.child, env.grandchild].flatMap((t) =>
            env.store
                .tree(t.id)
                .artifacts.filter((a) => a.kind === 'video')
                .flatMap((a) =>
                    [
                        mediaPath(env.dir, a.id),
                        join(env.dir, 'video-work', a.id),
                        join(env.dir, 'video-work', a.attempt),
                    ].map((path) => [path, a.id]),
                ),
        );
        env.close();
        const child = spawnSync(
            process.execPath,
            [
                '--input-type=module',
                '-e',
                `
      import { Store } from './server/store.mjs';
      import { renameSync } from 'node:fs';
      const [path, root, id, files, committed] = process.argv.slice(1), store = new Store(path);
      store.remove(root, id, () => {
        for (const [file, owner] of JSON.parse(files)) renameSync(file, file + '.deleting-' + owner);
        if (committed==='false') process.exit(42);
      });
      process.exit(43);
    `,
                env.path,
                env.root.id,
                env.child.id,
                JSON.stringify(files),
                String(committed),
            ],
            { encoding: 'utf8' },
        );
        assert.equal(child.status, committed ? 43 : 42, child.stderr);
        const recovered = new Store(env.path),
            app = createApp({ store: recovered, dir: env.dir, auth: { status: () => ({}) } });
        try {
            if (!committed) assert.deepEqual(snapshot(recovered), before);
            else assert.equal(recovered.tree(env.child.id), undefined);
            for (const [file, owner] of files) {
                assert.equal(existsSync(file), !committed);
                assert.equal(existsSync(file + '.deleting-' + owner), false);
            }
        } finally {
            app.stop();
            recovered.close();
        }
    }
});
