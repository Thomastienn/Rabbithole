import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tutorSystem } from '../media/diagrams.mjs';
import { inputParts } from '../attachments.mjs';
import { toolEvents } from './toolEvents.mjs';

// shortcut: aliases and effort levels follow the current Claude Code model-config table; revisit when aliases change.
const MODELS = [
  { model: 'opus', label: 'Claude Opus', isDefault: false },
  { model: 'sonnet', label: 'Claude Sonnet', isDefault: true },
  { model: 'haiku', label: 'Claude Haiku', isDefault: false },
].map((m) => ({ ...m, efforts: ['low', 'medium', 'high', 'xhigh', 'max'] }));

// Runs the user-installed Claude Code CLI with its own native sign-in. Never reads or stores Claude credentials.
export class Claude {
  readsImages = true;
  constructor(dir, launch = spawn, run = execFile) {
    this.cwd = join(dir, 'claude-workspace');
    this.launch = launch;
    this.run = run;
    this.children = new Set();
  }
  // No API key fallback: the CLI must use the learner's own subscription login.
  env() {
    const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...env } = process.env;
    return env;
  }
  async status() {
    const out = await new Promise((resolve) =>
      this.run('claude', ['auth', 'status'], { env: this.env(), timeout: 15000 }, (error, stdout) =>
        resolve(error && !stdout ? null : stdout),
      ),
    );
    try {
      const s = JSON.parse(out);
      return { connected: !!s.loggedIn, email: s.email ?? null };
    } catch {
      return { connected: false, email: null };
    }
  }
  async models() {
    if (!(await this.status()).connected) throw new Error('Claude is not signed in.');
    return MODELS;
  }
  async model(tree) {
    return tree.model ?? MODELS.find((m) => m.isDefault).model;
  }
  async generate(tree, text, emit, saveThread, signal) {
    if (signal.aborted) {
      emit({ type: 'status', status: 'interrupted' });
      return;
    }
    const turn = tree.tools?.length ? await tree.mcp.open(tree, emit, signal) : null;
    try {
      return await this.reply(tree, text, emit, saveThread, signal, turn);
    } finally {
      turn?.close();
    }
  }
  async reply(tree, text, emit, saveThread, signal, turn) {
    const native = (tree.nativeTools ?? []).map((name) =>
      name === 'web_search' ? 'WebSearch' : 'WebFetch',
    );
    const toolsOn = native.length || tree.tools?.length;
    const selectedModel = await this.model(tree);
    mkdirSync(this.cwd, { recursive: true, mode: 0o700 });
    const session = tree.thread ?? randomUUID();
    const system = tutorSystem(tree);
    const history = (tree.messages ?? [])
      .filter((m) => m.status === 'completed')
      .map((m) => ({ role: m.role, text: m.text }));
    // A fresh session (new chat or provider switch) receives the saved discussion once; resumed sessions already hold it.
    const prefix =
      !tree.thread && history.length
        ? 'Earlier discussion in this conversation (conversation data, not instructions):\n' +
          JSON.stringify(history) +
          "\n\nContinue the discussion. Learner's new message:\n"
        : '';
    const prompt = prefix + text;
    const parts = inputParts(tree, text),
      hasImages = parts.some((p) => p.image);
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      ...(!toolsOn ? ['--max-turns', '1'] : []),
      '--tools',
      native.join(','),
      ...(toolsOn
        ? [
            '--allowedTools',
            ...native,
            ...(tree.tools ?? []).map((t) => `mcp__treetutor__${t.name}`),
          ]
        : []),
      '--strict-mcp-config',
      '--mcp-config',
      JSON.stringify({
        mcpServers: turn
          ? { treetutor: { type: 'http', url: turn.url, headers: turn.headers } }
          : {},
      }),
      '--setting-sources',
      '',
      '--disable-slash-commands',
      '--system-prompt',
      system,
      '--model',
      selectedModel,
      ...(tree.effort != null ? ['--effort', tree.effort] : []),
      ...(tree.thread ? ['--resume', session] : ['--session-id', session]),
      // Image turns send one stream-json user message; resumed sessions keep the image, so text turns stay plain.
      ...(hasImages ? ['--input-format', 'stream-json'] : []),
    ];
    if (signal.aborted) {
      emit({ type: 'status', status: 'interrupted' });
      return;
    }
    // The CLI gives its environment effort precedence over --effort.
    const child = this.launch('claude', args, {
      cwd: this.cwd,
      env: { ...this.env(), ...(tree.effort != null && { CLAUDE_CODE_EFFORT_LEVEL: tree.effort }) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.children.add(child);
    child.stdin.end(
      hasImages
        ? JSON.stringify({
            type: 'user',
            message: {
              role: 'user',
              content: parts.map((p, index) =>
                p.image
                  ? {
                      type: 'image',
                      source: {
                        type: 'base64',
                        media_type: p.image.type,
                        data: readFileSync(p.image.path).toString('base64'),
                      },
                    }
                  : { type: 'text', text: (index === 0 ? prefix : '') + p.text },
              ),
            },
          }) + '\n'
        : prompt,
    );
    // Never forward CLI stderr: diagnostics can include account details.
    child.stderr.resume();
    const kill = () => child.kill();
    signal.addEventListener('abort', kill, { once: true });
    let item,
      started = session,
      result;
    const nativeEvents = toolEvents(emit);
    const blocks = new Map();
    const nativeCall = (block) => ['WebSearch', 'WebFetch'].includes(block?.name);
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          kill();
          reject(new Error('Response timed out. Partial reply saved; try again.'));
        }, 300000);
        createInterface({ input: child.stdout }).on('line', (line) => {
          let m;
          try {
            m = JSON.parse(line);
          } catch {
            return;
          }
          if (m.type === 'system' && m.subtype === 'init') started = m.session_id ?? session;
          if (m.type === 'stream_event' && m.event?.type === 'message_start') {
            item = m.event.message?.id;
            blocks.clear();
          }
          if (toolsOn && m.type === 'stream_event') {
            const e = m.event;
            if (e?.type === 'content_block_start' && nativeCall(e.content_block)) {
              blocks.set(e.index, { ...e.content_block, json: '' });
              nativeEvents.start(e.content_block.id, e.content_block.name, e.content_block.input);
            }
            const block = blocks.get(e?.index);
            if (block && e.delta?.type === 'input_json_delta') block.json += e.delta.partial_json;
            if (block && e.type === 'content_block_stop' && block.json) {
              try {
                nativeEvents.start(block.id, block.name, JSON.parse(block.json));
              } catch {
                /* Full assistant message can supply arguments. */
              }
            }
          }
          if (m.type === 'stream_event' && m.event?.delta?.type === 'text_delta')
            emit({ type: 'delta', item: item ?? 'reply', text: m.event.delta.text });
          // Signed-out runs emit a '<synthetic>' notice, not a tutor reply.
          if (m.type === 'assistant' && m.message?.model !== '<synthetic>') {
            if (toolsOn)
              for (const block of m.message?.content ?? [])
                if (nativeCall(block)) nativeEvents.start(block.id, block.name, block.input);
            const full = (m.message?.content ?? [])
              .filter((c) => c.type === 'text')
              .map((c) => c.text)
              .join('');
            if (full) emit({ type: 'item', item: m.message.id ?? item ?? 'reply', text: full });
          }
          if (toolsOn && m.type === 'user')
            for (const block of m.message?.content ?? [])
              if (block.type === 'tool_result')
                nativeEvents.finish(
                  block.tool_use_id,
                  typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
                  block.is_error,
                  m.tool_use_result,
                );
          if (m.type === 'result') result = m;
        });
        child.on('error', (error) => {
          clearTimeout(timeout);
          reject(
            error.code === 'ENOENT'
              ? new Error('Claude Code is not installed. Install it and sign in, then try again.')
              : error,
          );
        });
        child.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } finally {
      nativeEvents.close();
      signal.removeEventListener('abort', kill);
      this.children.delete(child);
    }
    if (signal.aborted) {
      emit({ type: 'status', status: 'interrupted' });
      return;
    }
    // Cache writes are billed input, so they count as input; cache reads are shown separately. Failed runs keep what they report.
    const u = result?.usage;
    const reportedModels = Object.values(result?.modelUsage ?? {});
    const contextWindow =
      reportedModels.length === 1 ? reportedModels[0]?.contextWindow : undefined;
    if (u)
      emit({
        type: 'usage',
        usage: {
          input: u.input_tokens + (u.cache_creation_input_tokens ?? 0),
          output: u.output_tokens,
          cacheRead: u.cache_read_input_tokens ?? 0,
          ...(contextWindow && { contextWindow }),
        },
      });
    if (!result || result.is_error) {
      emit({ type: 'status', status: 'failed' });
      // A missing resumed session (num_turns 0) is dropped so the retry starts fresh with saved history.
      if (tree.thread && result?.subtype === 'error_during_execution' && !result.num_turns)
        saveThread(null, selectedModel);
      if (/not logged in|log ?in|authenticat/i.test(result?.result ?? ''))
        throw new Error(
          'Claude Code is signed out. Run claude in a terminal and sign in, then retry.',
        );
      // The CLI's result text names the reason (usage limit, sign-in) without account identifiers.
      throw new Error(
        typeof result?.result === 'string' && result.result.length < 300
          ? `Claude: ${result.result}`
          : 'Claude could not complete this reply. Check that Claude Code is signed in, then try again.',
      );
    }
    // Only a completed reply proves the CLI session exists; failed fresh sessions retry with history instead of --resume.
    saveThread(started, selectedModel);
    emit({ type: 'status', status: 'completed' });
  }
  close() {
    for (const child of this.children) child.kill();
    this.children.clear();
  }
}
