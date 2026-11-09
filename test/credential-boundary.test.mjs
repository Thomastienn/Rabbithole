import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Auth } from '../server/auth.mjs';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

test('credential-bearing auth keeps tokens out of browser state, catalog, replies and reconnect URL', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'treetutor-credentials-'));
  const auth = new Auth(dir), store = new Store(join(dir, 'trees.sqlite'));
  const canaries = ['canary-access-secret', 'canary-refresh-secret', 'canary-id-secret'];
  auth.save({ access_token: canaries[0], refresh_token: canaries[1], id_token: canaries[2], scope: 'chatgpt.tokens.use.direct', expires_in: 3600 }, { sub: 'fixture-subject', email: 'learner@example.test' }, 'oaiapp_fixture');
  const restored = new Auth(dir);
  let inferenceCalls = 0;
  const app = createApp({ store, auth: restored, provider: {
    models: async () => [{ model: 'fixture-text', label: 'Fixture text', isDefault: true }],
    async generate(tree, text, emit, save) {
      assert.equal(await restored.token(), canaries[0]);
      inferenceCalls++;
      save('fixture-session', 'fixture-text');
      emit({ type: 'item', item: 'answer', text: 'A synthetic tutor reply.' });
      emit({ type: 'status', status: 'completed' });
    },
  } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`, bodies = [];
  const request = async (path, body) => {
    const response = await fetch(origin + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
    const text = await response.text(); bodies.push([path, text]); assert.equal(response.ok, true, path); return text;
  };
  let csrf;
  try {
    const state = JSON.parse(await request('/api/state')); csrf = state.csrf;
    assert.deepEqual(state.auth, { connected: true, email: 'learner@example.test' });
    await request('/api/models');
    const tree = JSON.parse(await request('/api/trees', {}));
    await request(`/api/trees/${tree.id}/messages`, { text: 'A synthetic question.' });
    await request(`/api/trees/${tree.id}`);
    await request(`/api/previews?id=${tree.id}`);
    const reconnect = new URL(JSON.parse(await request('/api/auth', {})).url);
    assert.equal(reconnect.searchParams.get('client_id'), 'oaiapp_fixture');
    assert.equal(reconnect.searchParams.get('ext_agent_host_id'), auth.host);
    assert.equal(reconnect.searchParams.has('id_token_hint'), false);
    assert.equal(reconnect.searchParams.has('agent_name_hint'), false);
    for (const [path, text] of bodies) for (const canary of canaries) assert.ok(!text.includes(canary), `Credential exposed by ${path}`);
    assert.equal(inferenceCalls, 1);
  } finally { app.stop(); store.close(); }
});
