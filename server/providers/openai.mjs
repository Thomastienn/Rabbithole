import { readFileSync, mkdirSync, chmodSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tutorSystem } from '../media/tutor-instructions.mjs';
import { inputParts } from '../attachments.mjs';
import {
    catalogue,
    EndpointError,
    endpointName,
    lastTest,
    readOwned,
    settings,
    responseError,
    requestShape,
} from './endpointSettings.mjs';
import { probeTools } from './toolProbe.mjs';
import { QUICK_TOOLS } from '../tools/quickTools.mjs';
import {
    addUsage,
    chunkUsage,
    history,
    idleLimit,
    ENDED,
    STALLED,
    redactStream,
    roundText,
    runTool,
    streamEvents,
} from './chatStream.mjs';

export { EndpointError };

// Model calls in one reply before the tool loop gives up.
const TOOL_ROUNDS = 30;

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
                                  ...(e.acceptsImages === true && { acceptsImages: true }),
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
                    this.#list = [
                        { id: 'openai', name: 'Custom endpoint', ...settings(readOwned(legacy)) },
                    ];
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
        for (const e of list)
            if (!this.#adapters.has(e.id)) this.#adapters.set(e.id, new Endpoint(e));
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
        this.#set([
            ...this.#list,
            {
                id: `openai:${randomUUID()}`,
                name,
                ...saved,
            },
        ]);
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
        const saved = settings({
            baseUrl: body.baseUrl,
            apiKey: newKey ? body.apiKey : old.apiKey,
        });
        if (!newKey && saved.baseUrl !== old.baseUrl)
            throw new EndpointError(
                'The base URL changed. Enter the API key again so the saved key is never sent to a new host.',
            );
        const name = endpointName(body.name, saved.apiKey);
        this.#unique(name, old.id);
        // The old Accepts images flag is no longer editable; it is kept as the fallback.
        this.#set(
            this.#list.map((e) =>
                e === old
                    ? {
                          id: old.id,
                          name,
                          ...saved,
                          ...(old.acceptsImages && { acceptsImages: true }),
                      }
                    : e,
            ),
        );
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
    close() {
        for (const adapter of this.#adapters.values()) adapter.close();
    }
}

class Endpoint {
    #saved;
    #requests = new Set();
    constructor(saved) {
        this.#saved = saved;
        this.label = saved.name;
        // The old endpoint-wide Accepts images flag: only the fallback for models that report no vision.
        this.acceptsImages = !!saved.acceptsImages;
    }
    async #fetch(saved, path, signal, body) {
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
        if (!response.ok)
            throw Object.assign(await responseError(response, saved.apiKey), {
                requestId: response.headers.get('x-request-id')?.slice(0, 100),
                request: body && requestShape(body),
            });
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
            return catalogue(await response.json(), saved.apiKey);
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
    probeTools(model) {
        const controller = new AbortController();
        this.#requests.add(controller);
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);
        const post = (body) => this.#fetch(this.#saved, '/chat/completions', signal, body);
        return probeTools(post, model).finally(() => this.#requests.delete(controller));
    }
    async model(tree, signal) {
        return tree.model ?? (await this.models(signal))[0].model;
    }
    async generate(tree, text, emit, saveThread, parentSignal) {
        const saved = this.#saved,
            controller = new AbortController();
        const signal = AbortSignal.any([parentSignal, controller.signal]);
        let call = signal;
        this.#requests.add(controller);
        try {
            signal.throwIfAborted();
            const model = await this.model(tree, signal);
            signal.throwIfAborted();
            const system = tutorSystem(tree);
            const parts = inputParts(tree, text);
            const tools = tree.tools ?? [];
            let answered = false;
            const messages = [
                { role: 'system', content: system },
                ...history(tree.messages ?? [], tools.length > 0),
                // This turn's images go as data URLs; history turns carry only their [image: name] text.
                {
                    role: 'user',
                    content: parts.some((p) => p.image)
                        ? parts.map((p) =>
                              p.image
                                  ? {
                                        type: 'image_url',
                                        image_url: {
                                            url: `data:${p.image.type};base64,${readFileSync(p.image.path).toString('base64')}`,
                                        },
                                    }
                                  : { type: 'text', text: p.text },
                          )
                        : text,
                },
            ];
            const output = redactStream(saved.apiKey, emit);
            const reply = roundText(output);
            // Every request asks for usage; tool turns sum each model call's report.
            const total = { input: 0, output: 0, cacheRead: 0 };
            // The loop ends when the model answers without tool calls or with only end-of-reply app calls, on Stop,
            // or after TOOL_ROUNDS model calls, so a model that repeats a tool call cannot keep charging unwatched.
            for (let rounds = 0; ; rounds++) {
                // The server may end the run here once the reply's end section is in (ADR 0016).
                emit({ type: 'response' });
                if (signal.reason === ENDED) break;
                if (rounds === TOOL_ROUNDS)
                    throw new EndpointError(
                        `Custom endpoint was still calling tools after ${TOOL_ROUNDS} rounds, so the reply was stopped. Partial reply saved; try again or choose another model.`,
                    );
                call = idleLimit(signal);
                const response = await this.#fetch(saved, '/chat/completions', call, {
                    model,
                    messages,
                    stream: true,
                    ...(tree.effort != null && { reasoning_effort: tree.effort }),
                    stream_options: { include_usage: true },
                    ...(tools.length && {
                        tools: tools.map((t) => ({ type: 'function', function: t })),
                    }),
                });
                const calls = new Map();
                // This call's latest usage report; some endpoints repeat it on several chunks.
                let used = null,
                    completed = false,
                    content = '';
                reply.start();
                try {
                    if (!response.headers.get('content-type')?.startsWith('text/event-stream'))
                        throw new EndpointError(
                            'Custom endpoint did not return a chat-completion stream. Check compatibility and the base URL.',
                        );
                    await streamEvents(response.body, call, (data) => {
                        if (data.trim() === '[DONE]') {
                            if (completed) return true;
                            throw new EndpointError(
                                'Custom endpoint ended the stream before completing the reply. Try again.',
                            );
                        }
                        const chunk = JSON.parse(data);
                        if (chunk.error)
                            throw new EndpointError(
                                'Custom endpoint reported a stream error. Try again.',
                            );
                        const reported = chunkUsage(chunk.usage);
                        if (reported) {
                            used = reported;
                            emit({ type: 'usage', usage: addUsage(total, used) });
                        }
                        const choice = chunk.choices?.find((c) => c.index === 0);
                        if (!choice) return false;
                        if (typeof choice.delta?.content === 'string' && choice.delta.content) {
                            content += choice.delta.content;
                            reply.write(choice.delta.content);
                        }
                        for (const t of choice.delta?.tool_calls ?? []) {
                            if (!Number.isSafeInteger(t.index) || t.index < 0)
                                throw new EndpointError(
                                    'Custom endpoint returned an invalid tool call index.',
                                );
                            if (!calls.has(t.index))
                                calls.set(t.index, {
                                    id: '',
                                    name: '',
                                    arguments: '',
                                });
                            const c = calls.get(t.index);
                            if (typeof t.id === 'string') c.id = t.id;
                            if (typeof t.function?.name === 'string') c.name += t.function.name;
                            if (typeof t.function?.arguments === 'string')
                                c.arguments += t.function.arguments;
                        }
                        if (choice.finish_reason) {
                            const tooling =
                                tools.length && calls.size && choice.finish_reason === 'tool_calls';
                            if (choice.finish_reason !== 'stop' && !tooling)
                                throw new EndpointError(
                                    choice.finish_reason === 'length'
                                        ? 'Custom endpoint reached its reply limit. Partial reply saved; try again.'
                                        : 'Custom endpoint could not complete a text reply (filtered content or unsupported output). Try another question or model.',
                                );
                            completed = true;
                        }
                        // With usage requested, its chunk follows the finish; read on to [DONE] or the stream's end.
                        return false;
                    });
                } finally {
                    if (!response.body?.locked) await response.body?.cancel().catch(() => {});
                }
                if (used) Object.assign(total, addUsage(total, used));
                call.throwIfAborted();
                reply.end();
                if (!completed)
                    throw new EndpointError(
                        'Custom endpoint ended without a complete text reply. Partial reply saved; try again.',
                    );
                const round = tools.length
                    ? [...calls].sort(([a], [b]) => a - b).map(([, c]) => c)
                    : [];
                if (!round.length) break;
                round.forEach((c, i) => (c.id ||= `call_${messages.length}_${i}`));
                messages.push({
                    role: 'assistant',
                    content: content || null,
                    tool_calls: round.map((c) => ({
                        id: c.id,
                        type: 'function',
                        function: { name: c.name, arguments: c.arguments },
                    })),
                });
                // Text before the call is on screen before the tool runs, so make_video lands after it.
                output('', true);
                answered = true;
                for (const c of round) {
                    const content = await runTool(tree, c, emit, signal, saved.apiKey);
                    messages.push({ role: 'tool', tool_call_id: c.id, content });
                    // An accepted quick thinking answer is the whole reply; a rejected one goes back to be fixed.
                    answered &&= QUICK_TOOLS.includes(c.name) && !content.startsWith('Error:');
                }
                if (answered) break;
            }
            // A call that reports through tools may end silently; its caller checks what the tools received.
            if (!reply.shown && !answered && !(tree.reportsByTools && messages.at(-1).tool_call_id))
                throw new EndpointError(
                    'Custom endpoint ended without a complete text reply. Partial reply saved; try again.',
                );
            output('', true);
            saveThread(null, model);
            emit({ type: 'status', status: 'completed' });
        } catch (error) {
            if (signal.aborted && signal.reason?.name !== 'TimeoutError') {
                emit({ type: 'status', status: 'interrupted' });
                return;
            }
            emit({ type: 'status', status: 'failed' });
            throw error instanceof EndpointError
                ? error
                : new EndpointError(
                      call.reason?.name === 'TimeoutError'
                          ? STALLED
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
