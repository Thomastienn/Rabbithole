import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import { open, until } from './diagram-kit.mjs';
import { notify } from './events.mjs';

// A Claude-like provider whose board process plays scripted output: each ask streams the next script in chunks.
export function boardProvider(scripts, { status = 'completed' } = {}) {
    const provider = {
        boards: [],
        models: async () => [{ model: 'sonnet', efforts: ['low'] }],
        model: async (tree) => tree.model ?? 'sonnet',
        board(options) {
            const board = {
                options,
                opened: 0,
                closed: false,
                asked: [],
                images: [],
                signals: [],
                thread: 'board-session',
                open: () => (board.opened++, notify()),
                close: () => ((board.closed = true), notify()),
                async ask(text, emit, signal, images = []) {
                    board.asked.push(text);
                    // The files last only for the turn, so the test keeps their bytes.
                    board.images.push(images.map((i) => ({ ...i, bytes: readFileSync(i.path) })));
                    board.signals.push(signal);
                    for (const chunk of scripts.shift() ?? []) {
                        if (signal.aborted) return { status: 'interrupted' };
                        emit({ type: 'delta', text: chunk });
                        await new Promise((resolve) => setImmediate(resolve));
                    }
                    // A script ending in a held promise waits there until the learner leaves.
                    if (board.hold)
                        await Promise.race([
                            board.hold,
                            new Promise((resolve) =>
                                signal.addEventListener('abort', resolve, { once: true }),
                            ),
                        ]);
                    if (signal.aborted)
                        return { status: 'interrupted', usage: board.interruptedUsage };
                    return {
                        status,
                        usage: { input: 10, output: 20, cacheRead: 5, thinking: 0 },
                    };
                },
            };
            provider.boards.push(board);
            return board;
        },
    };
    return provider;
}

export async function setup(t, provider, { providerName = 'claude', app = {} } = {}) {
    const logs = [];
    const env = await open(
        { models: async () => [], generate: async () => {} },
        {
            providers: { claude: provider },
            log: (line) => {
                logs.push(line);
                notify();
            },
            ...app,
        },
    );
    t.after(env.close);
    const { csrf } = await (await env.get('/api/state')).json();
    const id = env.store.create('What are hyphae?', providerName, 'sonnet').id;
    const connect = (query = `?csrf=${csrf}`, origin = env.origin) => {
        const ws = new WebSocket(
            `${env.origin.replace('http', 'ws')}/api/trees/${id}/board${query}`,
            {
                origin,
            },
        );
        const events = [];
        ws.on('error', () => {});
        ws.on('message', (data, binary) => {
            // A speech frame: one byte of sentence id length, the id, then the audio.
            events.push(
                binary
                    ? {
                          type: 'audio',
                          id: data.subarray(1, 1 + data[0]).toString(),
                          audio: data.subarray(1 + data[0]).toString(),
                      }
                    : JSON.parse(data),
            );
            notify();
        });
        t.after(() => ws.terminate());
        const next = async (type, match = () => true) => {
            await until(() => events.some((e) => e.type === type && match(e)));
            const index = events.findIndex((e) => e.type === type && match(e));
            return events.splice(0, index + 1).at(-1);
        };
        return { ws, events, next, send: (m) => ws.send(JSON.stringify(m)) };
    };
    return { env, id, logs, connect };
}

export const opened = (ws) =>
    new Promise((resolve, reject) => ws.once('open', resolve).once('error', reject));
export const messages = (env, id) => env.store.tree(id).messages;
