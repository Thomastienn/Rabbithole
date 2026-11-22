import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeTools, toolRunner } from '../../server/tools/runner.mjs';

const ready = { status: async () => ({ ready: true }) };
const runner = toolRunner({ search: { ready: async () => true }, python: ready });
const names = async (provider, settings, capable = true) =>
    (await runner.tools({ provider, capable, settings })).map((t) => t.name);

test('tool lists per provider follow every per-tool switch', async () => {
    assert.deepEqual(await names('openai:x', {}), [
        'web_search',
        'find_images',
        'read_page',
        'run_python',
    ]);
    assert.deepEqual(await names('codex', {}), ['find_images', 'read_page', 'run_python']);
    assert.deepEqual(await names('claude', {}), ['find_images', 'run_python']);
    const off = { web_search: false, read_page: false };
    assert.deepEqual(await names('openai:x', off), ['find_images', 'run_python']);
    assert.deepEqual(await names('codex', off), ['find_images', 'run_python']);
    const all = { web_search: false, find_images: false, read_page: false, run_python: false };
    for (const p of ['openai:x', 'codex', 'claude']) assert.deepEqual(await names(p, all), []);
    assert.deepEqual(await names('openai:x', {}, false), []);
});

test('native provider tools follow the same switches and the model toggle', () => {
    assert.deepEqual(nativeTools({ provider: 'claude', capable: true }), [
        'web_search',
        'read_page',
    ]);
    assert.deepEqual(nativeTools({ provider: 'codex', capable: true }), ['web_search']);
    assert.deepEqual(
        nativeTools({ provider: 'claude', capable: true, settings: { web_search: false } }),
        ['read_page'],
    );
    assert.deepEqual(
        nativeTools({ provider: 'codex', capable: true, settings: { web_search: false } }),
        [],
    );
    assert.deepEqual(nativeTools({ provider: 'claude', capable: false }), []);
    assert.deepEqual(nativeTools({ provider: 'openai:x', capable: true }), []);
});
