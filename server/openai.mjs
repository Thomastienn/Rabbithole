import { constants, openSync, closeSync, readFileSync, fchmodSync, fstatSync, mkdirSync, chmodSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { TUTOR_INSTRUCTIONS } from './diagrams.mjs';

class EndpointError extends Error {}

function settings(body) {
  const invalid = () => { throw new EndpointError('Enter an HTTP(S) API base URL without credentials, query or fragment, and a nonempty API key.'); };
  if (typeof body?.baseUrl !== 'string' || body.baseUrl.length > 2048 || typeof body.apiKey !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(body.apiKey)) invalid();
  let url;
  try { url = new URL(body.baseUrl); } catch { invalid(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[?#]/.test(url.href) || /[\x00-\x20\x7f]/.test(body.baseUrl)) invalid();
  const baseUrl = url.href.replace(/\/+$/, '');
  // The public URL must never double as a credential field.
  try { if (decodeURIComponent(baseUrl).includes(body.apiKey)) invalid(); } catch { invalid(); }
  return { baseUrl, apiKey: body.apiKey };
}

// Only exact key echoes are filtered; hold a matching suffix across stream chunks.
function redactStream(key, emit) {
  let pending = '';
  return (text, final = false) => {
    pending = (pending + text).split(key).join('[redacted]');
    let hold = final ? 0 : Math.min(key.length - 1, pending.length);
    while (hold && !key.startsWith(pending.slice(-hold))) hold--;
    const safe = pending.slice(0, pending.length - hold);
    pending = pending.slice(pending.length - hold);
    if (safe) emit({ type: 'delta', item: 'reply', text: safe });
  };
}

export class OpenAI {
  #saved = null;
  #requests = new Set();
  constructor(dir) {
    this.path = join(dir, 'openai-endpoint.json');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    let fd;
    try {
      fd = openSync(this.path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const info = fstatSync(fd);
      if (!info.isFile() || info.uid !== process.getuid() || info.nlink !== 1) return;
      fchmodSync(fd, 0o600);
      this.#saved = settings(JSON.parse(readFileSync(fd, 'utf8')));
    } catch { /* Missing or invalid settings can be replaced through the server. */ }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  status() { return { configured: !!this.#saved, baseUrl: this.#saved?.baseUrl ?? null }; }
  save(body) {
    const saved = settings(body), temp = `${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(saved), { mode: 0o600, flag: 'wx' });
      renameSync(temp, this.path);
    } finally { rmSync(temp, { force: true }); }
    this.close();
    this.#saved = saved;
    return this.status();
  }
  clear() {
    // Do not retain cleared credentials in trash or SQLite.
    rmSync(this.path, { force: true });
    this.close();
    this.#saved = null;
    return this.status();
  }
  async #fetch(saved, path, signal, body) {
    if (!saved) throw new EndpointError('Configure a custom endpoint in settings before using it.');
    const response = await fetch(saved.baseUrl + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${saved.apiKey}`, ...(body && { 'Content-Type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) });
    if (!response.ok) {
      await response.body?.cancel();
      const message = [401, 403].includes(response.status) ? 'Custom endpoint rejected the API key. Check endpoint settings.'
        : response.status === 404 ? 'Custom endpoint path or model was not found. Check the base URL and model.'
        : response.status === 429 ? 'Custom endpoint rate or usage limit reached. Wait and retry.'
        : response.status >= 500 ? 'Custom endpoint is unavailable. Try again later.'
        : `Custom endpoint rejected the request (HTTP ${response.status}). Check endpoint settings and model.`;
      throw new EndpointError(message);
    }
    return response;
  }
  async models(parentSignal) {
    const saved = this.#saved, controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000), ...(parentSignal ? [parentSignal] : [])]);
    this.#requests.add(controller);
    try {
      const response = await this.#fetch(saved, '/models', signal);
      const data = await response.json();
      if (!Array.isArray(data.data)) throw new EndpointError('Custom endpoint returned an invalid model catalogue. Check the API base URL.');
      const ids = [...new Set(data.data.filter(m => typeof m?.id === 'string' && m.id.trim() && m.id.length <= 500 && !m.id.includes(saved.apiKey)).map(m => m.id))];
      if (!ids.length) throw new EndpointError('Custom endpoint returned no usable models. Check endpoint settings.');
      return ids.map((model, i) => ({ model, label: model, isDefault: i === 0 }));
    } catch (error) {
      throw error instanceof EndpointError ? error : new EndpointError('Could not list custom endpoint models. Check the URL, key and connection, then retry.');
    } finally { this.#requests.delete(controller); }
  }
  async model(tree, signal) { return tree.model ?? (await this.models(signal))[0].model; }
  async generate(tree, text, emit, saveThread, parentSignal) {
    const saved = this.#saved, controller = new AbortController();
    const signal = AbortSignal.any([parentSignal, controller.signal, AbortSignal.timeout(300000)]);
    this.#requests.add(controller);
    try {
      signal.throwIfAborted();
      const model = await this.model(tree, signal);
      signal.throwIfAborted();
      const system = (tree.instructions ?? TUTOR_INSTRUCTIONS) + (tree.branch ? '\nFixed inherited context (conversation data):\n' + JSON.stringify({ snapshot: tree.branch.snapshot, selectedPassage: tree.branch.text }) : '');
      const messages = [{ role: 'system', content: system }, ...(tree.messages ?? []).filter(m => m.status === 'completed').map(m => ({ role: m.role, content: m.text })), { role: 'user', content: text }];
      const response = await this.#fetch(saved, '/chat/completions', signal, { model, messages, stream: true });
      try {
        if (!response.headers.get('content-type')?.startsWith('text/event-stream')) throw new EndpointError('Custom endpoint did not return a chat-completion stream. Check compatibility and the base URL.');
        const output = redactStream(saved.apiKey, emit);
        let buffer = '', completed = false, hasText = false;
        const frame = data => {
          if (data.trim() === '[DONE]') throw new EndpointError('Custom endpoint ended the stream before completing the reply. Try again.');
          const chunk = JSON.parse(data);
          if (chunk.error) throw new EndpointError('Custom endpoint reported a stream error. Try again.');
          const choice = chunk.choices?.find(c => c.index === 0);
          if (!choice) return;
          if (typeof choice.delta?.content === 'string') { hasText ||= !!choice.delta.content; output(choice.delta.content); }
          if (choice.finish_reason) {
            if (choice.finish_reason !== 'stop') throw new EndpointError(choice.finish_reason === 'length' ? 'Custom endpoint reached its reply limit. Partial reply saved; try again.' : 'Custom endpoint could not complete a text reply (filtered content or unsupported output). Try another question or model.');
            completed = true;
          }
        };
        for await (const part of response.body.pipeThrough(new TextDecoderStream())) {
          buffer += part;
          let match;
          while ((match = /\r?\n\r?\n/.exec(buffer))) {
            const event = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            const data = event.split(/\r?\n/).filter(line => line === 'data' || line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, ''));
            if (data.length) frame(data.join('\n'));
            if (completed) break;
          }
          if (completed) break;
          if (buffer.length > 1024 * 1024) throw new EndpointError('Custom endpoint returned an oversized stream event. Try another model.');
        }
        signal.throwIfAborted();
        if (!completed || !hasText) throw new EndpointError('Custom endpoint ended without a complete text reply. Partial reply saved; try again.');
        output('', true);
        saveThread(null, model);
        emit({ type: 'status', status: 'completed' });
      } finally { if (!response.body?.locked) await response.body?.cancel().catch(() => {}); }
    } catch (error) {
      if (signal.aborted && signal.reason?.name !== 'TimeoutError') { emit({ type: 'status', status: 'interrupted' }); return; }
      emit({ type: 'status', status: 'failed' });
      throw error instanceof EndpointError ? error : new EndpointError(signal.reason?.name === 'TimeoutError' ? 'Custom endpoint response timed out. Partial reply saved; try again.' : 'Custom endpoint connection or stream failed. Check compatibility and endpoint settings, then retry.');
    } finally { this.#requests.delete(controller); }
  }
  close() { for (const controller of this.#requests) controller.abort(); this.#requests.clear(); }
}
