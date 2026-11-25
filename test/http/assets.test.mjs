import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assetPath } from '../../server/http/routes/assets.mjs';
import { open } from '../support/video-kit.mjs';

const dist = 'C:\\Users\\learner\\Rabbithole\\dist';

test('Windows path rules serve files inside the UI folder', () => {
    assert.equal(assetPath(dist, '/', path.win32), `${dist}\\index.html`);
    assert.equal(assetPath(dist, '/assets/app.js', path.win32), `${dist}\\assets\\app.js`);
    assert.equal(assetPath(dist, '/fonts/a%20b.woff2', path.win32), `${dist}\\fonts\\a b.woff2`);
});

test('Windows path rules refuse paths that leave the UI folder', () => {
    for (const pathname of [
        '/..%5Csecret.txt',
        '/assets%5C..%5C..%5Csecret.txt',
        '/%2E%2E/secret.txt',
        '/..%2Fdist-other%2Fx.js',
        '/%2E%2E%5Cdist-other%5Cx.js',
    ])
        assert.equal(assetPath(dist, pathname, path.win32), null, pathname);
});

test('POSIX path rules keep the UI folder boundary', () => {
    assert.equal(assetPath('/app/dist', '/assets/app.js'), '/app/dist/assets/app.js');
    assert.equal(assetPath('/app/dist', '/%2E%2E/secret.txt'), null);
    assert.equal(assetPath('/app/dist', '/..%2Fdist-other%2Fx.js'), null);
});

test('a malformed percent escape is not found and logs nothing', async (t) => {
    assert.equal(assetPath(dist, '/%E0%A4%A', path.win32), null);
    const logs = [];
    const env = await open({ generate: async () => {} }, { log: (line) => logs.push(line) });
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    const response = await env.get('/%E0%A4%A');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Not found.' });
    assert.deepEqual(logs, []);
});

test('a folder under the assets path is not found', async (t) => {
    const assets = mkdtempSync(path.join(tmpdir(), 'tt-assets-'));
    mkdirSync(path.join(assets, 'fonts'));
    const env = await open({ generate: async () => {} }, { assets });
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    for (const pathname of ['/fonts', '/fonts/']) {
        const response = await env.get(pathname);
        assert.equal(response.status, 404, pathname);
        assert.deepEqual(await response.json(), { error: 'Not found.' });
    }
});
