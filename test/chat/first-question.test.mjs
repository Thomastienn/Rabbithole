import test from 'node:test';
import assert from 'node:assert/strict';
import { firstQuestion } from '../../src/chat/firstQuestion.ts';
import { fakeServer } from '../support/fake-server.mjs';

test('first question saves selected model once, opens before streaming, and keeps a saved reply', async (t) => {
    const calls = [],
        tree = { id: 'root' };
    const selection = { provider: 'claude', model: 'second', effort: null };
    fakeServer(t, (path, body) => {
        calls.push([path, body]);
        return path === '/api/trees'
            ? tree
            : { messages: [{ role: 'user' }, { role: 'assistant' }] };
    });
    const result = await firstQuestion('How do fungi trade?', selection, {
        refresh: async () => {
            calls.push('refresh');
        },
        open: async (next) => {
            assert.deepEqual(next, tree);
            calls.push('open');
        },
        send: async (text, next) => {
            assert.deepEqual(next, tree);
            calls.push(['send', text]);
        },
    });
    assert.deepEqual(result, { id: 'root', empty: false });
    assert.deepEqual(calls, [
        ['/api/trees', selection],
        'refresh',
        'open',
        ['send', 'How do fungi trade?'],
        ['/api/trees/root', undefined],
    ]);
    assert.deepEqual(selection, { provider: 'claude', model: 'second', effort: null });
});

test('failed create never opens/sends; retry creates once; unsaved first send removes only its empty tree', async (t) => {
    const calls = [];
    let fail = true;
    fakeServer(t, (path, body) => {
        calls.push([path, body]);
        if (path === '/api/trees') {
            if (fail) throw new Error('Create failed');
            return { id: 'empty' };
        }
        return { messages: [] };
    });
    const services = {
        refresh: async () => {
            calls.push('refresh');
        },
        open: async () => {
            calls.push('open');
        },
        send: async (text) => {
            calls.push(['send', text]);
        },
    };
    await assert.rejects(firstQuestion('Keep this draft', {}, services), /Create failed/);
    assert.deepEqual(calls, [['/api/trees', {}]]);
    calls.length = 0;
    fail = false;
    assert.deepEqual(await firstQuestion('Keep this draft', {}, services), {
        id: 'empty',
        empty: true,
    });
    assert.deepEqual(calls, [
        ['/api/trees', {}],
        'refresh',
        'open',
        ['send', 'Keep this draft'],
        ['/api/trees/empty', undefined],
        ['/api/trees/empty/delete', { conversation: 'empty', count: 1 }],
        'refresh',
    ]);
});
