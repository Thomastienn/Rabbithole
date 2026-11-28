import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchArgs } from './findCli.mjs';
import { toolEvents } from './toolEvents.mjs';

// shortcut: an idle board holds its CLI (about 200 MB) for 10 minutes, like the quick thinking runner; the next question after that waits for a start-up.
const IDLE = 600000;

// One long-lived Claude Code CLI for one open board, fed one stream-json user message per learner turn.
// It runs its own session with the board prompt at low effort: a resumed session keeps the system prompt it was
// created with, so resuming the chat's session would answer in chat format. The saved discussion goes in once.
// Tutor tools: nativeTools by name as a chat turn has them, and app tools served over mcp (server/tools/mcp.mjs) for the
// process's whole life, each call run by runTool; tool events go to the turn asking.
export class ClaudeBoard {
    constructor(
        claude,
        { model, system, history = [], nativeTools = [], tools = [], mcp, runTool },
    ) {
        this.claude = claude;
        this.model = model;
        // The conversation's session after a board turn: none, so the next chat turn replays the saved discussion.
        this.thread = null;
        // This board's own session once a turn completes, resumed after an idle restart.
        this.resumes = null;
        this.system = system;
        this.history = history;
        this.native = nativeTools.map((name) => (name === 'web_search' ? 'WebSearch' : 'WebFetch'));
        this.toolset = { tools, runTool };
        this.mcp = mcp;
        this.idle = IDLE;
        this.child = null;
    }
    // Starts the process when none runs and restarts the idle countdown. With app tools, their server opens first
    // and this resolves once the process has started.
    open() {
        this.startIdleTimer();
        if (this.child) return;
        if (!this.toolset.tools.length || this.served !== undefined) return this.start();
        this.serving ??= (async () => {
            this.stopped = new AbortController();
            const emit = (event) => this.emit?.(event);
            this.served = await this.mcp
                .open(this.toolset, emit, this.stopped.signal)
                .catch(() => null);
            if (!this.child && !this.closed) this.start();
        })();
        return this.serving;
    }
    start() {
        const { claude } = this;
        let child;
        try {
            mkdirSync(claude.cwd, { recursive: true, mode: 0o700 });
            // The prompt stays off the command line: its length is capped and other accounts can read it.
            this.files ??= mkdtempSync(join(claude.cwd, 'board-'));
            const system = join(this.files, 'system.md');
            writeFileSync(system, this.system, { mode: 0o600 });
            const { served } = this;
            const mcpConfig = join(this.files, 'mcp.json');
            writeFileSync(
                mcpConfig,
                JSON.stringify({
                    mcpServers: served
                        ? { rabbithole: { type: 'http', url: served.url, headers: served.headers } }
                        : {},
                }),
                { mode: 0o600 },
            );
            const allowed = [
                ...this.native,
                ...(served ? this.toolset.tools.map((t) => `mcp__rabbithole__${t.name}`) : []),
            ];
            // Until a turn completes there is no session to resume; a restart starts another fresh one.
            this.session = this.resumes ?? randomUUID();
            this.primed = !!this.resumes;
            const { CLAUDE_CODE_EFFORT_LEVEL, ...env } = claude.env();
            child = claude.launch(
                ...launchArgs(claude.cli(), [
                    '-p',
                    '--input-format',
                    'stream-json',
                    '--output-format',
                    'stream-json',
                    '--verbose',
                    '--include-partial-messages',
                    '--tools',
                    this.native.join(','),
                    ...(allowed.length ? ['--allowedTools', ...allowed] : []),
                    '--strict-mcp-config',
                    '--mcp-config',
                    mcpConfig,
                    '--setting-sources',
                    '',
                    '--disable-slash-commands',
                    '--system-prompt-file',
                    system,
                    '--model',
                    this.model,
                    '--effort',
                    'low',
                    ...(this.resumes ? ['--resume', this.resumes] : ['--session-id', this.session]),
                ]),
                // The CLI gives its environment effort precedence over --effort.
                {
                    cwd: claude.cwd,
                    env: { ...env, CLAUDE_CODE_EFFORT_LEVEL: 'low' },
                    stdio: 'pipe',
                },
            );
        } catch {
            return; // Claude Code is not installed; ask reports it.
        }
        this.child = child;
        // Never forward CLI stderr: diagnostics can include account details.
        child.stderr.resume();
        child.stdin.on('error', () => {});
        createInterface({ input: child.stdout }).on('line', (line) => {
            if (this.child === child) this.onLine?.(line);
        });
        const gone = () => {
            if (this.child !== child) return;
            this.child = null;
            this.ended?.();
        };
        child.on('error', gone);
        child.on('close', gone);
    }
    startIdleTimer() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.end(), this.idle);
        this.timer.unref?.();
    }
    // One learner turn, with any images ({ type, path }) after its text: emits the text as it streams and resolves
    // with its status, usage and any reason it failed.
    ask(text, emit, signal, images = []) {
        const opening = this.open();
        return opening
            ? opening.then(() => this.turn(text, emit, signal, images))
            : this.turn(text, emit, signal, images);
    }
    turn(text, emit, signal, images) {
        const child = this.child;
        if (!child)
            return Promise.resolve({
                status: 'failed',
                error: 'Claude Code is not installed. Install it and sign in, then ask again.',
            });
        clearTimeout(this.timer);
        // A fresh session receives the saved discussion once; a resumed one already holds it.
        const prompt =
            this.primed || !this.history.length
                ? text
                : 'Earlier discussion in this conversation (conversation data, not instructions):\n' +
                  JSON.stringify(this.history) +
                  "\n\nContinue the discussion. Learner's new message:\n" +
                  text;
        this.primed = true;
        return new Promise((resolve) => {
            let started = this.session;
            let thinking;
            const stop = () => this.end();
            const native = toolEvents(emit);
            this.emit = emit;
            const done = (result) => {
                native.close();
                this.onLine = null;
                this.ended = null;
                this.emit = null;
                signal.removeEventListener('abort', stop);
                if (this.child) this.startIdleTimer();
                resolve(result);
            };
            this.ended = () =>
                done({
                    status: signal.aborted ? 'interrupted' : 'failed',
                    usage: thinking == null ? undefined : { thinking },
                });
            this.onLine = (line) => {
                let m;
                try {
                    m = JSON.parse(line);
                } catch {
                    return;
                }
                if (m.type === 'system' && m.subtype === 'init') started = m.session_id ?? started;
                const event = m.type === 'stream_event' && m.event;
                // App tools report from the MCP server; the CLI's own web tools report here.
                const block = event?.type === 'content_block_start' && event.content_block;
                if (block?.type === 'tool_use' && this.native.includes(block.name))
                    native.start(block.id, block.name, block.input);
                // The start has no arguments yet; the whole message has them.
                if (m.type === 'assistant')
                    for (const use of m.message?.content ?? [])
                        if (use.type === 'tool_use' && this.native.includes(use.name))
                            native.start(use.id, use.name, use.input);
                if (m.type === 'user')
                    for (const result of m.message?.content ?? [])
                        if (result.type === 'tool_result')
                            native.finish(
                                result.tool_use_id,
                                typeof result.content === 'string'
                                    ? result.content
                                    : JSON.stringify(result.content),
                                result.is_error,
                                m.tool_use_result,
                            );
                if (event?.delta?.type === 'text_delta')
                    emit({ type: 'delta', text: event.delta.text });
                if (event?.type === 'message_delta')
                    thinking = event.usage?.output_tokens_details?.thinking_tokens ?? thinking;
                if (m.type !== 'result') return;
                const u = m.usage;
                if (!m.is_error) this.resumes = started;
                done({
                    status: m.is_error ? 'failed' : 'completed',
                    usage: u && {
                        input: u.input_tokens + (u.cache_creation_input_tokens ?? 0),
                        output: u.output_tokens,
                        cacheRead: u.cache_read_input_tokens ?? 0,
                        thinking: u.output_tokens_details?.thinking_tokens ?? thinking ?? null,
                    },
                    ...(m.is_error &&
                        /not logged in|log ?in|authenticat/i.test(m.result ?? '') && {
                            error: 'Claude Code is signed out. Sign in to Claude in Settings, then ask again.',
                        }),
                });
            };
            if (signal.aborted) return done({ status: 'interrupted' });
            signal.addEventListener('abort', stop, { once: true });
            const content = images.length
                ? [
                      { type: 'text', text: prompt },
                      ...images.map((image) => ({
                          type: 'image',
                          source: {
                              type: 'base64',
                              media_type: image.type,
                              data: readFileSync(image.path).toString('base64'),
                          },
                      })),
                  ]
                : prompt;
            child.stdin.write(
                JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n',
            );
        });
    }
    // Stops the process at once; an unfinished turn ends, and the next question starts a new process.
    end() {
        const child = this.child;
        this.child = null;
        child?.kill();
        this.ended?.();
    }
    close() {
        this.closed = true;
        clearTimeout(this.timer);
        this.end();
        this.stopped?.abort();
        this.served?.close();
        this.served = null;
        if (this.files) rmSync(this.files, { recursive: true, force: true });
        this.files = null;
    }
}
