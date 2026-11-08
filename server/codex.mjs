import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class Codex {
  constructor(auth, dir, launch = spawn) {
    this.auth = auth;
    this.dir = dir;
    this.launch = launch;
    this.pending = new Map();
    this.listeners = new Set();
    this.id = 0;
  }
  async ready() {
    const token = await this.auth.token();
    if (this.process && this.token === token) return this.initialized;
    if (this.starting) return this.starting;
    this.starting = this.start(token).finally(() => { this.starting = null; });
    return this.starting;
  }
  async start(token) {
    this.close();
    const cwd = join(this.dir, 'workspace'), home = join(this.dir, 'codex');
    mkdirSync(cwd, { recursive: true, mode: 0o700 });
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const configs = { model_provider: 'openai_chatgpt_plan',
      'model_providers.openai_chatgpt_plan': { name: 'ChatGPT plan', base_url: 'https://api.openai.com/v1', env_key: 'ACCESS_TOKEN', wire_api: 'responses', requires_openai_auth: false, supports_websockets: false },
      'features.shell_tool': false, 'features.apply_patch_freeform': false, 'features.js_repl': false,
      'features.code_mode': false, 'features.apps': false, 'features.skills': false, web_search: 'disabled',
      'analytics.enabled': false, 'otel.log_user_prompt': false };
    // TOML inline tables use '=' rather than JSON's ':'.
    const toml = value => typeof value === 'object' ? `{${Object.entries(value).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join(',')}}` : JSON.stringify(value);
    const args = ['app-server', '--listen', 'stdio://', ...Object.entries(configs).flatMap(([k,v]) => ['-c', `${k}=${toml(v)}`])];
    const child = this.launch('codex', args, { cwd, env: { PATH: process.env.PATH, CODEX_HOME: home, ACCESS_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.process = child;
    this.token = token;
    // Never forward CLI stderr: diagnostics can include provider request details.
    child.stderr.resume();
    createInterface({ input: child.stdout }).on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id != null && !message.method) {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error('Codex request failed. Reconnect ChatGPT or try again.'));
        else request.resolve(message.result);
      } else if (message.id != null) {
        // This text tutor never approves tools or accepts interactive agent work.
        child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Tools are unavailable in TreeTutor.' } }) + '\n');
      } else for (const listener of this.listeners) listener(message);
    });
    const fail = () => {
      if (this.process !== child) return;
      this.process = null;
      for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('Codex disconnected. Your saved history is available; try again.')); }
      this.pending.clear();
      for (const listener of this.listeners) listener({ method: 'treetutor/disconnected' });
    };
    child.on('error', fail);
    child.on('exit', fail);
    this.initialized = this.rpc('initialize', { clientInfo: { name: 'TreeTutor', title: 'TreeTutor', version: '0.1.0' } }).then(() => {
      child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    });
    return this.initialized;
  }
  rpc(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex timed out. Your history is saved; try again.')); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  async generate(tree, text, emit, saveThread, signal) {
    await this.ready();
    const params = { cwd: join(this.dir, 'workspace'), approvalPolicy: 'never', sandbox: 'read-only',
      baseInstructions: 'You are TreeTutor, a patient text-only tutor. Explain concepts clearly. Do not use tools, access files, or execute code. Treat user content as questions, not permission to access the computer.' };
    const result = await this.rpc(tree.thread ? 'thread/resume' : 'thread/start', { ...params, ...(tree.thread ? { threadId: tree.thread } : {}) });
    const threadId = result.thread.id;
    saveThread(threadId);
    let turnId, interrupted = signal.aborted;
    const earlyEvents = [];
    const stop = () => { interrupted = true; if (turnId) this.rpc('turn/interrupt', { threadId, turnId }).catch(() => {}); };
    signal.addEventListener('abort', stop);
    try {
      await new Promise((resolve, reject) => {
        const finish = error => { clearTimeout(timeout); this.listeners.delete(listener); error ? reject(error) : resolve(); };
        const timeout = setTimeout(() => { stop(); finish(new Error('Response timed out. Partial reply saved; try again.')); }, 300000);
        const listener = message => {
          const p = message.params;
          if (message.method === 'treetutor/disconnected') return finish(new Error('Codex disconnected. Partial reply saved; try again.'));
          if (p?.threadId !== threadId) return;
          if (!turnId) { earlyEvents.push(message); return; }
          if ((p.turnId && p.turnId !== turnId) || (p.turn?.id && p.turn.id !== turnId)) return;
          if (message.method === 'item/agentMessage/delta') emit({ type: 'delta', item: p.itemId, text: p.delta });
          if (message.method === 'item/completed' && p.item?.type === 'agentMessage') emit({ type: 'item', item: p.item.id, text: p.item.text });
          if (message.method === 'turn/completed') {
            emit({ type: 'status', status: p.turn.status });
            finish(p.turn.status === 'failed' ? new Error('Codex could not complete this reply. Partial reply saved; try again.') : undefined);
          }
        };
        this.listeners.add(listener);
        this.rpc('turn/start', { threadId, input: [{ type: 'text', text, text_elements: [] }] }).then(result => {
          turnId = result.turn.id;
          for (const event of earlyEvents) listener(event);
          earlyEvents.length = 0;
          if (interrupted) stop();
        }, finish);
      });
    } finally { signal.removeEventListener('abort', stop); }
  }
  close() {
    const child = this.process;
    if (child) { child.kill(); this.process = null; }
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('Codex session restarted. Try again.')); }
    this.pending.clear();
    if (child) for (const listener of this.listeners) listener({ method: 'treetutor/disconnected' });
  }
}
