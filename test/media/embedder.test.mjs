import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FILES, MODEL, REVISION, modelFiles } from '../../server/media/embedder.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');

test('the embedding loader accepts a matching download, refuses a mismatch or failed download, and keeps a matching cache', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tt-models-'));
    const bytes = Object.fromEntries(Object.keys(FILES).map((n) => [n, Buffer.from(`fake ${n}`)]));
    const files = Object.fromEntries(Object.keys(FILES).map((n) => [n, sha(bytes[n])]));
    const urls = [];
    {
        const name = (url) => url.split(`/resolve/${REVISION}/`)[1];
        const fake = async (url) => (urls.push(url), bytes[name(url)]);
        assert.equal(await modelFiles(root, fake, files), root);
        assert.ok(
            urls.every((u) => u.startsWith(`https://huggingface.co/${MODEL}/resolve/${REVISION}/`)),
        );
        for (const n of Object.keys(FILES))
            assert.deepEqual(readFileSync(join(root, MODEL, n)), bytes[n]);
        urls.length = 0;
        await modelFiles(root, fake, files);
        assert.equal(urls.length, 0, 'a cached file with a matching hash is not downloaded again');

        const other = mkdtempSync(join(tmpdir(), 'tt-models-'));
        await assert.rejects(
            modelFiles(other, async (url) => Buffer.from('tampered ' + name(url))),
            /does not match its recorded hash/,
        );
        assert.ok(!existsSync(join(other, MODEL, 'config.json')), 'a mismatched file is not kept');
        await assert.rejects(
            modelFiles(other, async () => {
                throw new Error('offline');
            }),
            /download failed.*offline/,
        );
        writeFileSync(join(root, MODEL, 'config.json'), 'corrupt');
        await assert.rejects(
            modelFiles(root, async () => Buffer.from('still wrong'), files),
            /does not match/,
            'a corrupt cache is downloaded again and checked',
        );
    }
});
