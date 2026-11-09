import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const issuer = 'https://auth.openai.com';
const resource = 'https://api.openai.com/v1';
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const random = () => randomBytes(32).toString('base64url');
export class Auth {
  constructor(dir) {
    this.path = join(dir, 'chatgpt.json');
    this.hostPath = join(dir, 'host-id');
    this.host = existsSync(this.hostPath) ? readFileSync(this.hostPath, 'utf8') : `urn:uuid:${randomUUID()}`;
    writeFileSync(this.hostPath, this.host, { mode: 0o600 });
    this.saved = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : null;
    this.pending = new Map();
  }
  status() { return { connected: !!this.saved, email: this.saved?.email ?? null }; }
  start(origin) {
    for (const [key, value] of this.pending) if (value.expiry < Date.now()) this.pending.delete(key);
    const state = random(), verifier = random(), nonce = random();
    const client = this.saved?.client_id ?? 'dynamic_agent_client';
    const redirect = `${origin}/auth/callback`;
    this.pending.set(state, { verifier, nonce, client, redirect, subject: this.saved?.subject, expiry: Date.now() + 600000 });
    const params = new URLSearchParams({ client_id: client, ext_agent_host_id: this.host, response_type: 'code', redirect_uri: redirect,
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource, state, nonce,
      code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
    if (client === 'dynamic_agent_client') params.set('agent_name_hint', 'TreeTutor');
    return `${issuer}/api/accounts/authorize?${params}`;
  }
  async exchange(fields) {
    const response = await fetch(`${issuer}/api/accounts/oauth/token`, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...fields, resource }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('ChatGPT authorization failed. Continue with ChatGPT to try again.');
    return response.json();
  }
  save(tokens, identity, client) {
    const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(' ') : this.saved?.scopes;
    if (!scopes?.includes('chatgpt.tokens.use.direct') || typeof tokens.access_token !== 'string' || !Number.isFinite(tokens.expires_in)) {
      throw new Error('ChatGPT plan permission missing. Continue with ChatGPT and allow plan usage.');
    }
    const record = { ...this.saved, ...tokens, scopes, subject: identity.sub, email: identity.email,
      client_id: client, expires_at: Date.now() + tokens.expires_in * 1000 };
    writeFileSync(`${this.path}.tmp`, JSON.stringify(record), { mode: 0o600 });
    renameSync(`${this.path}.tmp`, this.path);
    this.saved = record;
  }
  async callback(url) {
    const state = url.searchParams.get('state');
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending || pending.expiry <= Date.now()) throw new Error('Sign-in expired or could not be verified. Continue with ChatGPT to retry.');
    if (url.searchParams.has('error')) throw new Error('ChatGPT sign-in declined. Your saved trees are still available.');
    const issued = url.searchParams.get('client_id');
    const client = pending.client === 'dynamic_agent_client' ? issued : pending.client;
    if (!client || client === 'dynamic_agent_client' || (issued && issued !== client)) throw new Error('ChatGPT registration did not match. Start sign-in again.');
    const code = url.searchParams.get('code');
    if (!code) throw new Error('Authorization code missing. Start sign-in again.');
    const tokens = await this.exchange({ grant_type: 'authorization_code', client_id: client, code, code_verifier: pending.verifier, redirect_uri: pending.redirect });
    const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer, audience: client, requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5 });
    if (payload.nonce !== pending.nonce || (pending.subject && payload.sub !== pending.subject)) throw new Error('ChatGPT identity did not match. Start sign-in again.');
    this.save(tokens, payload, client);
  }
  async token() {
    if (!this.saved) throw new Error('Continue with ChatGPT before sending a question.');
    if (this.saved.expires_at > Date.now() + 60000) return this.saved.access_token;
    if (!this.refreshing) this.refreshing = this.refresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async refresh() {
    if (!this.saved.refresh_token) throw new Error('ChatGPT session expired. Continue with ChatGPT to reconnect.');
    const tokens = await this.exchange({ grant_type: 'refresh_token', client_id: this.saved.client_id, refresh_token: this.saved.refresh_token });
    this.save(tokens, { sub: this.saved.subject, email: this.saved.email }, this.saved.client_id);
    return this.saved.access_token;
  }
}
