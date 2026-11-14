import {
  constants,
  openSync,
  closeSync,
  readFileSync,
  fchmodSync,
  fstatSync,
  mkdirSync,
  chmodSync,
  writeFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tutorSystem } from '../media/diagrams.mjs';

export class EndpointError extends Error {}

function settings(body) {
  const invalid = () => {
    throw new EndpointError(
      'Enter an HTTP(S) API base URL without credentials, query or fragment, and a nonempty API key.',
    );
  };
  if (
    typeof body?.baseUrl !== 'string' ||
    body.baseUrl.length > 2048 ||
    typeof body.apiKey !== 'string' ||
    !/^[\x21-\x7e]{1,8192}$/.test(body.apiKey)
  )
    invalid();
  let url;
  try {
    url = new URL(body.baseUrl);
  } catch {
    invalid();
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    /[?#]/.test(url.href) ||
    /[\x00-\x20\x7f]/.test(body.baseUrl)
  )
    invalid();
  const baseUrl = url.href.replace(/\/+$/, '');
  // The public URL must never double as a credential field.
  try {
    if (decodeURIComponent(baseUrl).includes(body.apiKey)) invalid();
  } catch {
    invalid();
  }
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

function readOwned(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.uid !== process.getuid() || info.nlink !== 1)
      throw new EndpointError('Credential file is not an owner-only regular file.');
    fchmodSync(fd, 0o600);
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally {
    closeSync(fd);
  }
}

function lastTest(t) {
  return (
    t &&
    typeof t.at === 'string' &&
    (t.ok === true ? Number.isInteger(t.models) : t.ok === false && typeof t.error === 'string')
  );
}

function endpointName(name, apiKey) {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 80 ||
    /[\x00-\x1f\x7f]/.test(name) ||
    name.includes(apiKey)
  )
    throw new EndpointError('Enter an endpoint name of up to 80 characters.');
  return name.trim();
}

// The list of saved custom endpoints; each entry is registered as its own provider.
export class OpenAI {
  #list = [];
  #adapters = new Map();
  constructor(dir) {
    this.path = join(dir, 'openai-endpoints.json');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    try {
      const list = readOwned(this.path);
      this.#list = (Array.isArray(list) ? list : []).flatMap((e) => {
        try {
          return /^openai(:[0-9a-f-]{36})?$/.test(e?.id)
            ? [
                {
                  id: e.id,
                  name: endpointName(e.name, e.apiKey),
                  ...settings(e),
                  ...(lastTest(e.lastTest) && { lastTest: e.lastTest }),
                },
              ]
            : [];
        } catch {
          return [];
        }
      });
    } catch (error) {
      // Upgrade: the single saved endpoint becomes "Custom endpoint" and keeps provider id openai.
      const legacy = join(dir, 'openai-endpoint.json');
      if (error.code === 'ENOENT')
        try {
          this.#list = [{ id: 'openai', name: 'Custom endpoint', ...settings(readOwned(legacy)) }];
          this.#write();
          rmSync(legacy);
        } catch {
          this.#list = [];
        }
      /* Otherwise invalid settings can be replaced through the server. */
    }
    for (const e of this.#list) this.#adapters.set(e.id, new Endpoint(e));
  }
  #write() {
    if (!this.#list.length) {
      rmSync(this.path, { force: true });
      return;
    }
    const temp = `${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(this.#list), { mode: 0o600, flag: 'wx' });
      renameSync(temp, this.path);
    } finally {
      rmSync(temp, { force: true });
    }
  }
  #set(list) {
    const previous = this.#list;
    this.#list = list;
    try {
      this.#write();
    } catch (error) {
      this.#list = previous;
      throw error;
    }
    // Any change to name, URL or key replaces the adapter and aborts its in-flight requests; a test result alone does not.
    const same = (a, b) =>
      a && b && a.name === b.name && a.baseUrl === b.baseUrl && a.apiKey === b.apiKey;
    for (const [id, adapter] of this.#adapters)
      if (
        !same(
          list.find((e) => e.id === id),
          previous.find((p) => p.id === id),
        )
      ) {
        adapter.close();
        this.#adapters.delete(id);
      }
    for (const e of list) if (!this.#adapters.has(e.id)) this.#adapters.set(e.id, new Endpoint(e));
  }
  list() {
    return this.#list.map(({ id, name, baseUrl, lastTest }) => ({
      id,
      name,
      baseUrl,
      lastTest: lastTest ?? null,
    }));
  }
  providers() {
    return Object.fromEntries(this.#adapters);
  }
  add(body) {
    const saved = settings(body),
      name = endpointName(body.name, saved.apiKey);
    this.#unique(name);
    this.#set([...this.#list, { id: `openai:${randomUUID()}`, name, ...saved }]);
    return this.list();
  }
  #unique(name, id) {
    if (this.#list.some((e) => e.id !== id && e.name.toLowerCase() === name.toLowerCase()))
      throw new EndpointError(`Another endpoint is called ${name}. Choose a different name.`);
  }
  #find(id) {
    const old = this.#list.find((e) => e.id === id);
    if (!old) throw new EndpointError('Endpoint not found. Refresh Connections and try again.');
    return old;
  }
  // Rename keeps the key; a new base URL needs the key again so a saved key never reaches a new host unasked.
  edit(body) {
    const old = this.#find(body?.id),
      newKey = typeof body.apiKey === 'string' && body.apiKey !== '';
    const saved = settings({ baseUrl: body.baseUrl, apiKey: newKey ? body.apiKey : old.apiKey });
    if (!newKey && saved.baseUrl !== old.baseUrl)
      throw new EndpointError(
        'The base URL changed. Enter the API key again so the saved key is never sent to a new host.',
      );
    const name = endpointName(body.name, saved.apiKey);
    this.#unique(name, old.id);
    this.#set(this.#list.map((e) => (e === old ? { id: old.id, name, ...saved } : e)));
    return this.list();
  }
  // Lists models without sending a chat message; the result is kept until the next test or save.
  async test(id) {
    const old = this.#find(id),
      at = new Date().toISOString();
    let result;
    try {
      result = { ok: true, models: (await this.#adapters.get(id).models()).length, at };
    } catch (error) {
      result = {
        ok: false,
        error:
          error instanceof EndpointError
            ? error.message
            : 'Could not list custom endpoint models. Check the URL, key and connection, then retry.',
        at,
      };
    }
    // Drop the result if the endpoint was edited or removed while testing.
    if (this.#list.includes(old))
      this.#set(this.#list.map((e) => (e === old ? { ...e, lastTest: result } : e)));
    return this.list();
  }
  remove(id) {
    // Do not retain removed credentials in trash or SQLite: the rewritten file no longer holds the key.
    this.#find(id);
    this.#set(this.#list.filter((e) => e.id !== id));
    return this.list();
  }
  // shortcut: the single-endpoint routes act on the migrated "openai" entry; drop once no caller uses them.
  status() {
    const e = this.#list.find((e) => e.id === 'openai');
    return { configured: !!e, baseUrl: e?.baseUrl ?? null };
  }
  save(body) {
    const saved = settings(body),
      old = this.#list.find((e) => e.id === 'openai'),
      entry = { id: 'openai', name: old?.name ?? 'Custom endpoint', ...saved };
    this.#set(old ? this.#list.map((e) => (e === old ? entry : e)) : [entry, ...this.#list]);
    return this.status();
  }
  clear() {
    this.#set(this.#list.filter((e) => e.id !== 'openai'));
    return this.status();
  }
  #legacy() {
    return this.#adapters.get('openai') ?? new Endpoint(null);
  }
  models(signal) {
    return this.#legacy().models(signal);
  }
  model(tree, signal) {
    return this.#legacy().model(tree, signal);
  }
  generate(...args) {
    return this.#legacy().generate(...args);
  }
  close() {
    for (const adapter of this.#adapters.values()) adapter.close();
  }
}

class Endpoint {
  #saved;
  #requests = new Set();
  constructor(saved) {
    this.#saved = saved;
    this.label = saved?.name;
  }
  async #fetch(saved, path, signal, body) {
    if (!saved) throw new EndpointError('Configure a custom endpoint in settings before using it.');
    const response = await fetch(saved.baseUrl + path, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal,
      headers: {
        Authorization: `Bearer ${saved.apiKey}`,
        ...(body && { 'Content-Type': 'application/json' }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const message = [401, 403].includes(response.status)
        ? 'Custom endpoint rejected the API key. Check endpoint settings.'
        : response.status === 404
          ? 'Custom endpoint path or model was not found. Check the base URL and model.'
          : response.status === 429
            ? 'Custom endpoint rate or usage limit reached. Wait and retry.'
            : response.status >= 500
              ? 'Custom endpoint is unavailable. Try again later.'
              : `Custom endpoint rejected the request (HTTP ${response.status}). Check endpoint settings and model.`;
      throw new EndpointError(message);
    }
    return response;
  }
  async models(parentSignal) {
    const saved = this.#saved,
      controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
      ...(parentSignal ? [parentSignal] : []),
    ]);
    this.#requests.add(controller);
    try {
      const response = await this.#fetch(saved, '/models', signal);
      const data = await response.json();
      if (!Array.isArray(data.data))
        throw new EndpointError(
          'Custom endpoint returned an invalid model catalogue. Check the API base URL.',
        );
      const models = data.data.filter(
        (m) =>
          typeof m?.id === 'string' &&
          m.id.trim() &&
          m.id.length <= 500 &&
          !m.id.includes(saved.apiKey),
      );
      const ids = [...new Set(models.map((m) => m.id))];
      if (!ids.length)
        throw new EndpointError(
          'Custom endpoint returned no usable models. Check endpoint settings.',
        );
      return ids.map((model, i) => {
        // shortcut: /models has no standard effort discovery; only accept explicitly advertised levels, never guess by model name.
        const levels = models.find((m) => m.id === model).supported_reasoning_efforts;
        return {
          model,
          label: model,
          isDefault: i === 0,
          efforts: Array.isArray(levels)
            ? [
                ...new Set(
                  levels.filter(
                    (e) =>
                      typeof e === 'string' &&
                      /^[a-z][a-z0-9_-]{0,31}$/.test(e) &&
                      !e.includes(saved.apiKey),
                  ),
                ),
              ]
            : [],
        };
      });
    } catch (error) {
      throw error instanceof EndpointError
        ? error
        : new EndpointError(
            'Could not list custom endpoint models. Check the URL, key and connection, then retry.',
          );
    } finally {
      this.#requests.delete(controller);
    }
  }
  async model(tree, signal) {
    return tree.model ?? (await this.models(signal))[0].model;
  }
  async generate(tree, text, emit, saveThread, parentSignal) {
    const saved = this.#saved,
      controller = new AbortController();
    const signal = AbortSignal.any([parentSignal, controller.signal, AbortSignal.timeout(300000)]);
    this.#requests.add(controller);
    try {
      signal.throwIfAborted();
      const model = await this.model(tree, signal);
      signal.throwIfAborted();
      const system = tutorSystem(tree);
      const messages = [
        { role: 'system', content: system },
        ...(tree.messages ?? [])
          .filter((m) => m.status === 'completed')
          .map((m) => ({ role: m.role, content: m.text })),
        { role: 'user', content: text },
      ];
      const response = await this.#fetch(saved, '/chat/completions', signal, {
        model,
        messages,
        stream: true,
        ...(tree.effort != null && { reasoning_effort: tree.effort }),
      });
      try {
        if (!response.headers.get('content-type')?.startsWith('text/event-stream'))
          throw new EndpointError(
            'Custom endpoint did not return a chat-completion stream. Check compatibility and the base URL.',
          );
        const output = redactStream(saved.apiKey, emit);
        let buffer = '',
          completed = false,
          hasText = false;
        const frame = (data) => {
          if (data.trim() === '[DONE]')
            throw new EndpointError(
              'Custom endpoint ended the stream before completing the reply. Try again.',
            );
          const chunk = JSON.parse(data);
          if (chunk.error)
            throw new EndpointError('Custom endpoint reported a stream error. Try again.');
          const choice = chunk.choices?.find((c) => c.index === 0);
          if (!choice) return;
          if (typeof choice.delta?.content === 'string') {
            hasText ||= !!choice.delta.content;
            output(choice.delta.content);
          }
          if (choice.finish_reason) {
            if (choice.finish_reason !== 'stop')
              throw new EndpointError(
                choice.finish_reason === 'length'
                  ? 'Custom endpoint reached its reply limit. Partial reply saved; try again.'
                  : 'Custom endpoint could not complete a text reply (filtered content or unsupported output). Try another question or model.',
              );
            completed = true;
          }
        };
        for await (const part of response.body.pipeThrough(new TextDecoderStream())) {
          buffer += part;
          let match;
          while ((match = /\r?\n\r?\n/.exec(buffer))) {
            const event = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            const data = event
              .split(/\r?\n/)
              .filter((line) => line === 'data' || line.startsWith('data:'))
              .map((line) => line.slice(5).replace(/^ /, ''));
            if (data.length) frame(data.join('\n'));
            if (completed) break;
          }
          if (completed) break;
          if (buffer.length > 1024 * 1024)
            throw new EndpointError(
              'Custom endpoint returned an oversized stream event. Try another model.',
            );
        }
        signal.throwIfAborted();
        if (!completed || !hasText)
          throw new EndpointError(
            'Custom endpoint ended without a complete text reply. Partial reply saved; try again.',
          );
        output('', true);
        saveThread(null, model);
        emit({ type: 'status', status: 'completed' });
      } finally {
        if (!response.body?.locked) await response.body?.cancel().catch(() => {});
      }
    } catch (error) {
      if (signal.aborted && signal.reason?.name !== 'TimeoutError') {
        emit({ type: 'status', status: 'interrupted' });
        return;
      }
      emit({ type: 'status', status: 'failed' });
      throw error instanceof EndpointError
        ? error
        : new EndpointError(
            signal.reason?.name === 'TimeoutError'
              ? 'Custom endpoint response timed out. Partial reply saved; try again.'
              : 'Custom endpoint connection or stream failed. Check compatibility and endpoint settings, then retry.',
          );
    } finally {
      this.#requests.delete(controller);
    }
  }
  close() {
    for (const controller of this.#requests) controller.abort();
    this.#requests.clear();
  }
}
