import { observeStore, observeProvider } from './events.mjs';
export { until } from './events.mjs';
import { join } from 'node:path';
import { fixtureLaunch } from './fixture-launch.mjs';
import { Store } from '../../server/store.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { createApp } from '../../server/app.mjs';

export const SAVED = [
  { start: 0, end: 13, text: 'Authoritative' },
  { start: 14, end: 22, text: 'original' },
];

export async function start(dir, suggestions = true, connected = { claude: true, codex: true }) {
  const calls = [],
    requests = [],
    turns = [],
    children = [];
  const launch = (command, args) => {
    const child = fixtureLaunch(command, args);
    children.push(child);
    if (command === 'claude') {
      const end = child.stdin.end.bind(child.stdin);
      child.stdin.end = (input) => {
        requests.push(input);
        calls.push({
          system: args[args.indexOf('--system-prompt') + 1],
          model: args.includes('--model') ? args[args.indexOf('--model') + 1] : null,
          effort: args.includes('--effort') ? args[args.indexOf('--effort') + 1] : null,
          input,
        });
        return end(input);
      };
    } else {
      const write = child.stdin.write.bind(child.stdin);
      child.stdin.write = (line) => {
        const m = JSON.parse(line);
        if (m.method === 'turn/start') {
          requests.push(m.params.input[0].text);
          turns.push(m.params);
        }
        return write(line);
      };
    }
    return child;
  };
  const store = observeStore(new Store(join(dir, 'trees.sqlite')));
  const claude = new Claude(dir, launch, (_c, _a, _o, cb) =>
    cb(null, JSON.stringify({ loggedIn: connected.claude })),
  );
  const codex = new Codex(
    {
      token: async () => {
        if (!connected.codex) throw new Error('Signed out.');
        return 'fixture-token';
      },
    },
    dir,
    launch,
  );
  observeProvider(claude);
  observeProvider(codex);
  const endpoint = new OpenAI(dir);
  const app = createApp({
    store,
    dir,
    endpoint,
    providers: { claude, codex, ...(endpoint.status().configured && { openai: endpoint }) },
    defaultProvider: 'claude',
    auth: { status: () => ({ connected: connected.codex }) },
    suggestions,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const get = async (path) => (await fetch(origin + path)).json();
  const { csrf } = await get('/api/state');
  const request = (path, data = {}, headers = {}) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf, ...headers },
      body: JSON.stringify(data),
    });
  const post = async (path, data = {}) => (await request(path, data)).text();
  const settled = () => app.settled();
  const suggestionCalls = () => calls.filter((c) => c.system.startsWith('You mark'));
  return {
    store,
    app,
    release: () => children.forEach((c) => c.release()),
    get,
    post,
    request,
    settled,
    calls,
    requests,
    turns,
    suggestionCalls,
    close: async () => {
      await app.stop();
      store.close();
    },
  };
}
