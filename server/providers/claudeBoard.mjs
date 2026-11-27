import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchArgs } from './findCli.mjs';

// shortcut: an idle board holds its CLI (about 200 MB) for 10 minutes, like the quick thinking runner; the next question after that waits for a start-up.
const IDLE = 600000;

// One long-lived Claude Code CLI for one open board, fed one stream-json user message per learner turn.
// It resumes the conversation's own session with the board prompt at low effort, so board turns and chat turns share history.
export class ClaudeBoard {
    constructor(claude, { model, thread, system, history = [] }) {
        this.claude = claude;
        this.model = model;
        this.thread = thread;
        this.system = system;
        this.history = history;
        this.idle = IDLE;
        this.child = null;
    }
    // Starts the process when none runs and restarts the idle countdown.
    open() {
        this.startIdleTimer();
        if (this.child) return;
        const { claude } = this;
        let child;
        try {
            mkdirSync(claude.cwd, { recursive: true, mode: 0o700 });
            // The prompt stays off the command line: its length is capped and other accounts can read it.
            this.files ??= mkdtempSync(join(claude.cwd, 'board-'));
            const system = join(this.files, 'system.md');
            writeFileSync(system, this.system, { mode: 0o600 });
            // Until a turn completes there is no session to resume; a restart starts another fresh one.
            this.session = this.thread ?? randomUUID();
            this.primed = !!this.thread;
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
                    '',
                    '--strict-mcp-config',
                    '--mcp-config',
                    JSON.stringify({ mcpServers: {} }),
                    '--setting-sources',
                    '',
                    '--disable-slash-commands',
                    '--system-prompt-file',
                    system,
                    '--model',
                    this.model,
                    '--effort',
                    'low',
                    ...(this.thread ? ['--resume', this.thread] : ['--session-id', this.session]),
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
        this.open();
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
            const done = (result) => {
                this.onLine = null;
                this.ended = null;
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
                if (event?.delta?.type === 'text_delta')
                    emit({ type: 'delta', text: event.delta.text });
                if (event?.type === 'message_delta')
                    thinking = event.usage?.output_tokens_details?.thinking_tokens ?? thinking;
                if (m.type !== 'result') return;
                const u = m.usage;
                if (!m.is_error) this.thread = started;
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
        clearTimeout(this.timer);
        this.end();
        if (this.files) rmSync(this.files, { recursive: true, force: true });
        this.files = null;
    }
}
