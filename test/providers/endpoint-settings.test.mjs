import assert from 'node:assert/strict';
import { mkdtempDisposableSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readOwned } from '../../server/providers/endpointSettings.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';

test('saved custom endpoints reload without process.getuid', (t) => {
    const dir = mkdtempDisposableSync(join(tmpdir(), 'tt-endpoint-settings-'));
    t.after(dir.remove);
    const endpoints = new OpenAI(dir.path);
    endpoints.add({ name: 'Local', baseUrl: 'http://127.0.0.1:1111/v1', apiKey: 'demo-key' });
    const saved = endpoints.add({
        name: 'Gateway',
        baseUrl: 'http://127.0.0.1:2222/v1',
        apiKey: 'demo-key',
    });
    endpoints.close();

    const getuid = process.getuid;
    delete process.getuid;
    try {
        assert.deepEqual(new OpenAI(dir.path).list(), saved);
    } finally {
        if (getuid) process.getuid = getuid;
    }
});

test('POSIX refuses a credential file with a different owner', { skip: !process.getuid }, (t) => {
    const dir = mkdtempDisposableSync(join(tmpdir(), 'tt-endpoint-settings-'));
    t.after(dir.remove);
    const path = join(dir.path, 'openai-endpoints.json');
    writeFileSync(path, '[]', { mode: 0o600 });
    const uid = statSync(path).uid;
    t.mock.method(process, 'getuid', () => uid + 1);
    assert.throws(() => readOwned(path), /owner-only regular file/);
});
