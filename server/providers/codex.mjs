import { spawn } from 'node:child_process';
import { launchArgs } from './findCli.mjs';
import { createInterface } from 'node:readline';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tutorSystem } from '../media/diagrams.mjs';
import { inputParts } from '../attachments.mjs';
import { toolEvents } from './toolEvents.mjs';
import { ENDED, STALLED } from './chatStream.mjs';

export class Codex {
    readsImages = true;
    constructor(auth, dir, launch = spawn, toolSession = null, bin = () => 'codex') {
        this.auth = auth;
        this.bin = bin;
        this.dir = dir;
        this.launch = launch;
        this.pending = new Map();
        this.listeners = new Set();
        this.id = 0;
        this.toolSession = toolSession;
        this.workers = new Set();
    }
    async ready() {
        const token = await this.auth.token();
        if (this.process && this.token === token) return this.initialized;
        if (this.starting) return this.starting;
        this.starting = this.start(token).finally(() => {
            this.starting = null;
        });
        return this.starting;
    }
    installed() {
        return !!this.bin();
    }
    async start(token) {
        this.close();
        const bin = this.bin();
        if (!bin) throw new Error('Codex is not installed. Install it, then check again.');
        const cwd = join(this.dir, 'workspace'),
            home = join(this.dir, 'codex');
        mkdirSync(cwd, { recursive: true, mode: 0o700 });
        mkdirSync(home, { recursive: true, mode: 0o700 });
        const configs = {
            model_provider: 'openai_chatgpt_plan',
            'model_providers.openai_chatgpt_plan': {
                name: 'ChatGPT plan',
                base_url: 'https://api.openai.com/v1',
                env_key: 'ACCESS_TOKEN',
                wire_api: 'responses',
                requires_openai_auth: false,
                supports_websockets: false,
                ...(this.toolSession?.webSearch && { supports_standalone_web_search: true }),
            },
            'features.shell_tool': false,
            'features.apply_patch_freeform': false,
            'features.js_repl': false,
            'features.code_mode': false,
            'features.apps': false,
            'features.skills': false,
            web_search: 'disabled',
            'analytics.enabled': false,
            'otel.log_user_prompt': false,
            ...(this.toolSession && {
                ...(this.toolSession.webSearch && {
                    web_search: 'live',
                    'features.standalone_web_search': true,
                }),
                'skills.include_instructions': false,
                'skills.bundled.enabled': false,
                'features.skill_search': false,
                ...(this.toolSession.mcp && {
                    'mcp_servers.rabbithole': {
                        url: this.toolSession.mcp.url,
                        http_headers: this.toolSession.mcp.headers,
                        enabled_tools: this.toolSession.tools.map((t) => t.name),
                        default_tools_approval_mode: 'approve',
                    },
                }),
            }),
        };
        // TOML inline tables use '=' rather than JSON's ':'.
        const toml = (value) =>
            Array.isArray(value)
                ? `[${value.map(toml).join(',')}]`
                : typeof value === 'object'
                  ? `{${Object.entries(value)
                        .map(
                            ([k, v]) =>
                                `${/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k)}=${toml(v)}`,
                        )
                        .join(',')}}`
                  : JSON.stringify(value);
        const args = [
            'app-server',
            '--listen',
            'stdio://',
            ...Object.entries(configs).flatMap(([k, v]) => ['-c', `${k}=${toml(v)}`]),
        ];
        const child = this.launch(...launchArgs(bin, args), {
            cwd,
            env: { PATH: process.env.PATH, CODEX_HOME: home, ACCESS_TOKEN: token },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.process = child;
        this.token = token;
        // Never forward CLI stderr: diagnostics can include provider request details.
        child.stderr.resume();
        createInterface({ input: child.stdout }).on('line', (line) => {
            let message;
            try {
                message = JSON.parse(line);
            } catch {
                return;
            }
            if (message.id != null && !message.method) {
                const request = this.pending.get(message.id);
                if (!request) return;
                this.pending.delete(message.id);
                clearTimeout(request.timer);
                if (message.error)
                    request.reject(
                        new Error('Codex request failed. Reconnect ChatGPT or try again.'),
                    );
                else request.resolve(message.result);
            } else if (message.id != null) {
                // This text tutor never approves tools or accepts interactive agent work.
                child.stdin.write(
                    JSON.stringify({
                        id: message.id,
                        error: { code: -32601, message: 'Tools are unavailable in Rabbithole.' },
                    }) + '\n',
                );
            } else for (const listener of this.listeners) listener(message);
        });
        const fail = () => {
            if (this.process !== child) return;
            this.process = null;
            for (const { reject, timer } of this.pending.values()) {
                clearTimeout(timer);
                reject(
                    new Error('Codex disconnected. Your saved history is available; try again.'),
                );
            }
            this.pending.clear();
            for (const listener of this.listeners) listener({ method: 'rabbithole/disconnected' });
        };
        child.on('error', fail);
        child.on('exit', fail);
        this.initialized = this.rpc('initialize', {
            clientInfo: { name: 'Rabbithole', title: 'Rabbithole', version: '0.1.0' },
        }).then(() => {
            child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
        });
        return this.initialized;
    }
    rpc(method, params) {
        return new Promise((resolve, reject) => {
            const id = ++this.id;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('Codex timed out. Your history is saved; try again.'));
            }, 30000);
            this.pending.set(id, { resolve, reject, timer });
            this.process.stdin.write(JSON.stringify({ id, method, params }) + '\n');
        });
    }
    async model(tree) {
        if (tree.model) return tree.model;
        const model = (await this.models()).find((m) => m.isDefault)?.model;
        if (!model)
            throw new Error(
                'Codex did not list a default text model. Refresh models and choose one.',
            );
        return model;
    }
    async models() {
        await this.ready();
        const models = [];
        let cursor;
        do {
            const page = await this.rpc('model/list', {
                limit: 100,
                includeHidden: false,
                ...(cursor ? { cursor } : {}),
            });
            models.push(
                ...page.data
                    .filter(
                        (m) =>
                            !m.hidden && (!m.inputModalities || m.inputModalities.includes('text')),
                    )
                    .map((m) => ({
                        model: m.model,
                        label: m.displayName,
                        isDefault: m.isDefault,
                        ...(m.supportedReasoningEfforts && {
                            efforts: m.supportedReasoningEfforts.map((e) => e.reasoningEffort),
                        }),
                        ...(m.defaultReasoningEffort && {
                            defaultEffort: m.defaultReasoningEffort,
                        }),
                    })),
            );
            cursor = page.nextCursor;
        } while (cursor);
        const terra = models.find((m) => m.model === 'gpt-6.1-terra');
        const selected = terra ?? models.find((m) => m.isDefault);
        return models.map((m) => ({
            ...m,
            isDefault: m === selected,
            defaultFallback: !terra && m === selected,
        }));
    }
    async generate(tree, text, emit, saveThread, signal) {
        if (
            (tree.nativeTools?.length || tree.tools?.length) &&
            !this.toolSession &&
            !signal.aborted
        ) {
            const mcp = tree.tools?.length ? await tree.mcp.open(tree, emit, signal) : null;
            // A fresh CLI per tool turn reloads its header even on resumed threads; concurrent turns cannot share credentials.
            const worker = new Codex(
                this.auth,
                this.dir,
                this.launch,
                {
                    mcp,
                    tools: tree.tools ?? [],
                    webSearch: !!tree.nativeTools?.includes('web_search'),
                },
                this.bin,
            );
            this.workers.add(worker);
            try {
                return await worker.generate(tree, text, emit, saveThread, signal);
            } finally {
                mcp?.close();
                worker.close();
                this.workers.delete(worker);
            }
        }
        const cancelled = () => {
            if (!signal.aborted) return false;
            emit({ type: 'status', status: 'interrupted' });
            return true;
        };
        if (cancelled()) return;
        await this.ready();
        if (cancelled()) return;
        const model = await this.model(tree);
        // turn/start retains effort across turns; resolve the advertised default when clearing an override.
        const effort =
            tree.effort ?? (await this.models()).find((m) => m.model === model)?.defaultEffort;
        if (cancelled()) return;
        const params = {
            cwd: join(this.dir, 'workspace'),
            approvalPolicy: 'never',
            sandbox: 'read-only',
            baseInstructions: tutorSystem(tree),
        };
        const result = await this.rpc(tree.thread ? 'thread/resume' : 'thread/start', {
            ...params,
            model,
            ...(tree.thread ? { threadId: tree.thread } : {}),
        });
        if (cancelled()) return;
        const threadId = result.thread.id;
        if (!tree.thread) {
            const items = (tree.messages ?? [])
                .filter((m) => m.status === 'completed')
                .map((m) => ({
                    type: 'message',
                    role: m.role,
                    content: [
                        {
                            type: m.role === 'assistant' ? 'output_text' : 'input_text',
                            text: m.text,
                        },
                    ],
                }));
            if (items.length) await this.rpc('thread/inject_items', { threadId, items });
        }
        if (cancelled()) return;
        saveThread(threadId, model);
        let turnId,
            interrupted = false,
            finishTurn,
            usage,
            baseline,
            contextWindow;
        const native = toolEvents(emit);
        const emitUsage = () => {
            if (usage)
                emit({
                    type: 'usage',
                    usage: {
                        input: usage.inputTokens - usage.cachedInputTokens,
                        output: usage.outputTokens,
                        cacheRead: usage.cachedInputTokens,
                        ...(Number.isSafeInteger(usage.reasoningOutputTokens) && {
                            reasoning: usage.reasoningOutputTokens,
                        }),
                        ...(contextWindow && { contextWindow }),
                    },
                });
        };
        const earlyEvents = [];
        const interrupt = () => {
            interrupted = true;
            if (turnId) this.rpc('turn/interrupt', { threadId, turnId }).catch(() => {});
        };
        const stop = () => {
            interrupt();
            finishTurn?.();
        };
        signal.addEventListener('abort', stop);
        try {
            await new Promise((resolve, reject) => {
                const finish = (error) => {
                    clearTimeout(timeout);
                    this.listeners.delete(listener);
                    error ? reject(error) : resolve();
                };
                finishTurn = () => {
                    // A run the server ended at the end section completed; the next turn resumes the thread.
                    if (signal.reason === ENDED) emitUsage();
                    emit({
                        type: 'status',
                        status: signal.reason === ENDED ? 'completed' : 'interrupted',
                    });
                    finish();
                };
                // Times silence, not the whole turn, so a reply with several long tool calls can finish.
                let timeout;
                const idle = () => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => {
                        interrupt();
                        finish(new Error(STALLED));
                    }, 300000);
                };
                idle();
                // Set once a tool call finishes; only then does reasoning or a message begin a later model response.
                let toolDone = false;
                const listener = (message) => {
                    if (signal.aborted) return;
                    const p = message.params;
                    if (message.method === 'rabbithole/disconnected')
                        return finish(
                            new Error('Codex disconnected. Partial reply saved; try again.'),
                        );
                    if (p?.threadId !== threadId) return;
                    idle();
                    if (!turnId) {
                        earlyEvents.push(message);
                        return;
                    }
                    if ((p.turnId && p.turnId !== turnId) || (p.turn?.id && p.turn.id !== turnId))
                        return;
                    const said = ['userMessage', 'reasoning', 'agentMessage'].includes(
                        p.item?.type,
                    );
                    if (message.method === 'item/completed' && p.item && !said) toolDone = true;
                    if (message.method === 'item/started' && said && toolDone) {
                        toolDone = false;
                        emit({ type: 'response' });
                    }
                    if (message.method === 'item/agentMessage/delta')
                        emit({ type: 'delta', item: p.itemId, text: p.delta });
                    if (message.method === 'item/completed' && p.item?.type === 'agentMessage')
                        emit({ type: 'item', item: p.item.id, text: p.item.text });
                    if (this.toolSession && p.item?.type === 'webSearch') {
                        const tool = p.item;
                        if (
                            message.method === 'item/started' ||
                            message.method === 'item/completed'
                        )
                            native.start(tool.id, 'web_search', {
                                query: tool.query,
                                action: tool.action,
                            });
                        if (message.method === 'item/completed')
                            native.finish(
                                tool.id,
                                JSON.stringify(tool.results ?? tool.action ?? null),
                                false,
                                [tool.action, tool.results],
                            );
                    }
                    if (message.method === 'thread/tokenUsage/updated') {
                        const { last, total } = p.tokenUsage ?? {};
                        if (this.toolSession && last && total) {
                            const keys = [
                                'inputTokens',
                                'cachedInputTokens',
                                'outputTokens',
                                'reasoningOutputTokens',
                            ];
                            baseline ??= Object.fromEntries(
                                keys.map((k) => [k, total[k] - last[k]]),
                            );
                            usage = Object.fromEntries(
                                keys.map((k) => [k, total[k] - baseline[k]]),
                            );
                        } else usage = last;
                        contextWindow = p.tokenUsage?.modelContextWindow;
                        if (this.toolSession) emitUsage();
                    }
                    if (message.method === 'turn/completed') {
                        // inputTokens includes cached reads; report them apart like Claude. Failed turns still consumed what they report.
                        if (!this.toolSession) emitUsage();
                        emit({ type: 'status', status: p.turn.status });
                        const reason = p.turn.error?.message; // e.g. usage limits; shown like Claude's short results so the learner knows why
                        finish(
                            p.turn.status === 'failed'
                                ? new Error(
                                      typeof reason === 'string' && reason.length < 300
                                          ? `Codex: ${reason} Partial reply saved; try again.`
                                          : 'Codex could not complete this reply. Partial reply saved; try again.',
                                  )
                                : undefined,
                        );
                    }
                };
                this.listeners.add(listener);
                this.rpc('turn/start', {
                    threadId,
                    model,
                    ...(effort != null && { effort }),
                    input: inputParts(tree, text).map((p) =>
                        p.image
                            ? { type: 'localImage', path: p.image.path }
                            : { type: 'text', text: p.text, text_elements: [] },
                    ),
                }).then((result) => {
                    turnId = result.turn.id;
                    if (interrupted) {
                        interrupt();
                        return;
                    }
                    for (const event of earlyEvents) listener(event);
                    earlyEvents.length = 0;
                }, finish);
            });
        } finally {
            native.close();
            signal.removeEventListener('abort', stop);
        }
    }
    close() {
        for (const worker of this.workers) worker.close();
        this.workers.clear();
        const child = this.process;
        if (child) {
            child.kill();
            this.process = null;
        }
        for (const { reject, timer } of this.pending.values()) {
            clearTimeout(timer);
            reject(new Error('Codex session restarted. Try again.'));
        }
        this.pending.clear();
        if (child)
            for (const listener of this.listeners) listener({ method: 'rabbithole/disconnected' });
    }
}
