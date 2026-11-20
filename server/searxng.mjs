import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { ensureSearxng } from '../scripts/searxng-setup.mjs';

// Werkzeug is already a SearXNG dependency. Bind port 0 and report the actual port, without a probe race.
const SERVE = `
import os, sys, threading
def parent_closed():
    sys.stdin.read()
    os._exit(0)
threading.Thread(target=parent_closed, daemon=True).start()
from searx.webapp import app
from werkzeug.serving import make_server
server = make_server('127.0.0.1', 0, app, threaded=True)
print('RABBITHOLE_SEARXNG=' + str(server.server_port), flush=True)
server.serve_forever()
`;

export async function managedSearxng(
    dir,
    {
        signal,
        setup = ensureSearxng,
        launch = spawn,
        schedule = setTimeout,
        cancel = clearTimeout,
        log = console.log,
    } = {},
) {
    let state = { ready: false, url: null, error: 'SearXNG is starting.' };
    let child, closed, stopping;
    const status = () => ({ ...state });
    const stop = () =>
        (stopping ??= (async () => {
            if (!child || child.exitCode !== null || child.signalCode) return;
            child.stdin.end();
            child.kill('SIGTERM');
            const timer = schedule(() => child.kill('SIGKILL'), 5000);
            await closed;
            cancel(timer);
        })());
    try {
        const installed = await setup({ dir, signal, log });
        if (!installed.ready) throw new Error(installed.error);
        signal?.throwIfAborted();
        child = launch(installed.python, ['-u', '-c', SERVE], {
            ...installed.options,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', (chunk) => {
            stderr = (stderr + chunk).slice(-4000);
        });
        const lines = createInterface({ input: child.stdout });
        closed = new Promise((resolve) => child.once('close', resolve));
        await new Promise((resolve, reject) => {
            let failure;
            const fail = (error) => {
                failure ??= error;
                state = {
                    ready: false,
                    url: null,
                    error: `SearXNG unavailable: ${failure.message} Restart npm start to retry.`,
                };
                cancel(timer);
                lines.close();
                reject(error);
            };
            const timer = schedule(
                () => fail(new Error('SearXNG did not start within 60 seconds.')),
                60000,
            );
            child.once('error', fail);
            child.once('close', (code, signal) =>
                fail(
                    new Error(`SearXNG stopped (${signal ?? code}). ${stderr.trim().slice(-2000)}`),
                ),
            );
            lines.on('line', (line) => {
                const match = line.match(/^RABBITHOLE_SEARXNG=(\d+)$/);
                if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) return;
                cancel(timer);
                state = { ready: true, url: `http://127.0.0.1:${match[1]}`, error: null };
                lines.close();
                resolve();
            });
        });
        log(`SearXNG ready: ${state.url}`);
    } catch (error) {
        await stop();
        state = {
            ready: false,
            url: null,
            error: `${error.message} Search is unavailable; restart npm start to retry.`,
        };
        log(state.error);
    }
    return { status, stop };
}

// Web search downloads only when asked for (offered on adding a custom endpoint); once its folder exists,
// every launch starts it, re-queuing a download that was cut short.
export function searxngDownload(dir, { manage = managedSearxng, setup = ensureSearxng } = {}) {
    let current;
    const offline = (options) =>
        setup({
            ...options,
            run: async () => {
                throw new Error('SearXNG is not downloaded.');
            },
        });
    const launch = async (install, signal) => {
        if (current?.status().ready) return true;
        await current?.stop();
        current = await manage(dir, {
            setup: install,
            signal,
            log: install === offline ? () => {} : undefined,
        });
        return current.status().ready;
    };
    return {
        status: () =>
            current?.status() ?? {
                ready: false,
                url: null,
                error: 'Web search is not downloaded. Adding a custom endpoint offers it.',
            },
        stop: () => current?.stop(),
        tool: {
            id: 'searxng',
            name: 'Web search',
            requested: () => existsSync(join(dir, 'searxng')),
            ready: () => launch(offline),
            run: async ({ signal }) => {
                if (!(await launch(setup, signal))) throw new Error(current.status().error);
            },
        },
    };
}
