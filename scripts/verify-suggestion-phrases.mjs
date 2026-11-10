// One native old/new call per saved reply. Reads live SQLite only to create a consistent isolated snapshot.
// Usage: node scripts/verify-suggestion-phrases.mjs out.json old-revision [--codex]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import lockfile from 'proper-lockfile';
import { Auth } from '../server/auth.mjs';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';
import { Store } from '../server/store.mjs';
import { anchored, knownConcepts, suggest } from '../server/suggestions.mjs';

assert.ok(process.argv[2] && process.argv[3], 'Supply output path and the old revision.');
process.umask(0o077);
const dir = mkdtempSync(join(tmpdir(), 'tt-phrase-comparison-'));
const source = join(process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor'), 'trees.sqlite');
const live = new DatabaseSync(source, { readOnly: true });
try { await backup(live, join(dir, 'snapshot.sqlite')); } finally { live.close(); }
const oldRevision = execFileSync('git', ['rev-parse', '--verify', process.argv[3]], { encoding: 'utf8' }).trim();
const oldSource = execFileSync('git', ['show', `${oldRevision}:server/suggestions.mjs`], { encoding: 'utf8' });
const old = await import(`data:text/javascript;base64,${Buffer.from(oldSource).toString('base64')}`);
const report = {
  issue: 'TreeTutor-u7v.2', date: new Date().toISOString(), source, snapshot: dir, oldRevision,
  newSourceSha256: createHash('sha256').update(readFileSync('server/suggestions.mjs')).digest('hex'),
  route: process.argv.includes('--codex') ? 'Native Codex app-server, existing app-owned ChatGPT consent under exclusive lock, same model for both prompts, fresh isolated sessions, no API-key fallback or credential copy' : 'Native Claude Code CLI, existing subscription sign-in, haiku for both prompts, fresh isolated sessions, no API-key fallback',
  selection: 'Five most recent completed saved replies of at least 140 characters, oldest first. Same snapshot question, inherited context, current known concepts and familiarity for both prompts; graph is not updated between calls.',
  prompts: {}, cases: []
};
const save = () => writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
const providerId = process.argv.includes('--codex') ? 'codex' : 'claude';
const release = providerId === 'codex' ? await lockfile.lock(dirname(source), { realpath: true, stale: 10000 }) : null;
const store = new Store(join(dir, 'snapshot.sqlite')), provider = providerId === 'claude' ? new Claude(dir) : new Codex(new Auth(dirname(source)), dir);
const nativeGenerate = provider.generate.bind(provider);
try {
  const models = await provider.models();
  const model = providerId === 'claude' ? 'haiku' : models.find(m => /luna/i.test(m.model))?.model ?? models.find(m => m.isDefault)?.model;
  assert.ok(model, 'A comparison model is available.');
  report.model = { provider: providerId, model };
  const replies = store.db.prepare("SELECT id, tree, seq, text FROM messages WHERE role='assistant' AND status='completed' AND length(text)>=140 ORDER BY seq DESC LIMIT 5").all().reverse();
  assert.equal(replies.length, 5, 'Five saved replies available.');
  const known = knownConcepts(store.graph());
  for (const reply of replies) {
    const tree = store.tree(reply.tree), branch = tree.branch;
    const question = store.db.prepare("SELECT text FROM messages WHERE tree=? AND seq<? AND role='user' AND status='completed' ORDER BY seq DESC LIMIT 1").get(reply.tree, reply.seq)?.text;
    assert.ok(question, 'Saved question available.');
    const input = {
      inheritedContext: branch ? { snapshot: branch.snapshot, selectedPassage: branch.text, question: branch.question } : null,
      question, answer: reply.text, knownConcepts: known,
      familiarity: store.mentioned([branch?.text, question, reply.text].filter(Boolean).join('\n'))
    };
    const entry = { message: reply.id, conversation: reply.tree, input };
    report.cases.push(entry);
    for (const [variant, run] of [['old', old.suggest], ['new', suggest]]) {
      const result = entry[variant] = {}, items = new Map();
      provider.generate = async (selection, text, emit, ...rest) => {
        const task = JSON.parse(text.slice(text.indexOf('\n') + 1));
        report.prompts[variant] = { system: selection.instructions, prompt: text.slice(0, text.indexOf('\n')) };
        Object.assign(result, { model: selection.model, freshSession: selection.thread === null, inputCharacters: text.length, answerWordEntries: task.answerWords?.length ?? 0 });
        if (variant === 'new') assert.deepEqual(task, input, 'New request carries reply once and no offset table.');
        return nativeGenerate(selection, text, event => {
          if (event.type === 'delta' || event.type === 'item') items.set(event.item, event.type === 'item' ? event.text : (items.get(event.item) ?? '') + event.text);
          if (event.type === 'status') result.status = event.status;
          emit(event);
        }, ...rest);
      };
      try { Object.assign(result, await run(provider, { provider: providerId, model }, input, new AbortController().signal, 120000, model)); }
      catch (error) { Object.assign(result, { error: error.message, usage: error.usage ?? null }); }
      result.rawOutput = [...items.values()].join('\n\n');
      try { result.picks = JSON.parse(result.rawOutput.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')).suggestions; } catch { result.picks = null; }
      result.droppedPicks = Array.isArray(result.picks) && result.passages ? result.picks.length - result.passages.length : null;
      save();
      console.log(JSON.stringify({ message: reply.id, variant, usage: result.usage, picks: result.picks?.length, dropped: result.droppedPicks, error: result.error }));
      if (result.error && !result.rawOutput) throw new Error(result.error);
    }
  }
  report.totals = Object.fromEntries(['old', 'new'].map(variant => {
    const runs = report.cases.map(c => c[variant]);
    return [variant, Object.fromEntries(['input', 'output', 'cacheRead', 'picks', 'droppedPicks'].map(key => [key, runs.reduce((sum, r) => sum + (key === 'picks' ? r.picks?.length ?? 0 : key === 'droppedPicks' ? r.droppedPicks ?? 0 : r.usage?.[key] ?? 0), 0)]))];
  }));
  report.pass = report.cases.every(c => ['old', 'new'].every(v => c[v]?.status === 'completed' && c[v].usage && !c[v].error && c[v].passages.every(p => anchored(c.input.answer, p))));
} catch (error) { report.error = error.message; report.pass = false; }
finally { provider.close(); store.close(); await release?.(); save(); }
console.log(JSON.stringify({ pass: report.pass, totals: report.totals, error: report.error }));
process.exitCode = report.pass ? 0 : 1;
