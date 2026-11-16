import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Auth } from '../../server/providers/auth.mjs';
const make = () => new Auth(mkdtempSync(join(tmpdir(), 'rabbithole-auth-')));

test('OAuth uses fresh state/PKCE/nonce, stable host, issued client and protected storage', () => {
  const auth = make();
  const a = new URL(auth.start('http://127.0.0.1:4317'));
  const b = new URL(auth.start('http://127.0.0.1:4317'));
  for (const field of ['state', 'nonce', 'code_challenge'])
    assert.notEqual(a.searchParams.get(field), b.searchParams.get(field));
  assert.equal(a.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(a.searchParams.get('resource'), 'https://api.openai.com/v1');
  const host = auth.host;
  auth.save(
    {
      access_token: 'synthetic-access',
      refresh_token: 'synthetic-refresh',
      id_token: 'synthetic-id',
      scope: 'chatgpt.tokens.use.direct',
      expires_in: 3600,
    },
    { sub: 'synthetic-user' },
    'oaiapp_synthetic',
  );
  assert.equal(statSync(auth.path).mode & 0o777, 0o600);
  const restored = new Auth(join(auth.path, '..'));
  assert.equal(restored.host, host);
  const returning = new URL(restored.start('http://127.0.0.1:4317'));
  assert.equal(returning.searchParams.get('client_id'), 'oaiapp_synthetic');
  assert.equal(returning.searchParams.has('agent_name_hint'), false);
});

test('rejects missing/reused/expired/declined/mismatched-client callbacks before exchange', async () => {
  const auth = make();
  let exchanges = 0;
  auth.exchange = async () => {
    exchanges++;
  };
  await assert.rejects(auth.callback(new URL('http://127.0.0.1:4317/auth/callback?state=unknown')));
  const start = new URL(auth.start('http://127.0.0.1:4317'));
  const state = start.searchParams.get('state');
  const callback = new URL(
    `http://127.0.0.1:4317/auth/callback?state=${state}&error=access_denied`,
  );
  await assert.rejects(auth.callback(callback), /declined/);
  await assert.rejects(auth.callback(callback), /expired/);
  const next = new URL(auth.start('http://127.0.0.1:4317')).searchParams.get('state');
  auth.pending.get(next).expiry = 0;
  await assert.rejects(
    auth.callback(new URL(`http://127.0.0.1:4317/auth/callback?state=${next}`)),
    /expired/,
  );
  auth.saved = { client_id: 'oaiapp_selected', id_token: 'synthetic', subject: 'user' };
  const returning = new URL(auth.start('http://127.0.0.1:4317')).searchParams.get('state');
  await assert.rejects(
    auth.callback(
      new URL(
        `http://127.0.0.1:4317/auth/callback?state=${returning}&client_id=oaiapp_other&code=synthetic`,
      ),
    ),
    /did not match/,
  );
  assert.equal(exchanges, 0);
});

test('serializes token refresh, persists rotating tokens, never enables inference without plan scope', async () => {
  const auth = make();
  await assert.rejects(auth.token(), /Continue with ChatGPT/);
  assert.throws(
    () =>
      auth.save(
        { access_token: 'synthetic', expires_in: 3600, scope: 'openid' },
        { sub: 'user' },
        'oaiapp_test',
      ),
    /permission missing/,
  );
  auth.save(
    {
      access_token: 'old',
      refresh_token: 'old-refresh',
      expires_in: -1,
      scope: 'chatgpt.tokens.use.direct',
    },
    { sub: 'user' },
    'oaiapp_test',
  );
  let calls = 0;
  auth.exchange = async (fields) => {
    calls++;
    assert.equal(fields.client_id, 'oaiapp_test');
    return { access_token: 'replacement', refresh_token: 'rotated', expires_in: 3600 };
  };
  assert.deepEqual(await Promise.all([auth.token(), auth.token()]), ['replacement', 'replacement']);
  assert.equal(calls, 1);
  assert.equal(auth.saved.refresh_token, 'rotated');
});
