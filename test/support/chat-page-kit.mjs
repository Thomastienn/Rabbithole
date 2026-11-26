// Shared mount for ChatPage composition tests: the whole page over a fake server.
import { createElement as h } from 'react';
import { render } from './render.mjs';
import { ui } from './ui.mjs';
import { fakeServer } from './fake-server.mjs';

const models = {
    models: [{ provider: 'claude', model: 'opus', label: 'Opus', isDefault: true, efforts: [] }],
    providers: { claude: { label: 'Claude', connected: true } },
};
export const tree = {
    id: 't1',
    title: 'Fungi',
    provider: 'claude',
    model: 'opus',
    effort: null,
    branch: null,
    artifacts: [],
    messages: [
        { id: 'q1', role: 'user', text: 'What are hyphae?', status: 'completed' },
        { id: 'a1', role: 'assistant', text: 'Thin threads.', status: 'completed' },
    ],
};

export async function mount(
    t,
    trees,
    { mobile = false, contents = 'open', focus = 'off', vim = false, artifacts = [], respond } = {},
) {
    const calls = [];
    const scrolls = [];
    fakeServer(t, async (path, _body, options) => {
        calls.push(path);
        const response = await respond?.(path, options);
        if (response) return response;
        const body =
            path === '/api/state'
                ? {
                      csrf: 'c',
                      auth: { connected: true, email: null },
                      trees,
                      active: [],
                      videos: [],
                  }
                : path === '/api/models'
                  ? models
                  : path === '/api/settings/chat'
                    ? { provider: 'claude', model: null, effort: null }
                    : path === '/api/graph'
                      ? { concepts: [], links: [], topics: [] }
                      : path.startsWith('/api/videos?')
                        ? { total: 0, videos: [] }
                        : path === '/api/trees/t1'
                          ? { ...tree, artifacts }
                          : path.startsWith('/api/previews?') && artifacts.length
                            ? { t1: [{ ...tree.messages[1], artifacts }] }
                            : {};
        return { ok: true, json: async () => body };
    });
    const { default: ChatPage } = await import('../../src/shell/ChatPage.tsx');
    let stubs;
    const page = await render(
        h(ChatPage, { appearance: 'light', setAppearance() {}, theme: 'neutral', setTheme() {} }),
        (w) => {
            stubs = ui(w, { mobile });
            w.Element.prototype.scrollIntoView = function (options) {
                scrolls.push({ element: this, options });
            };
            w.localStorage.setItem('rabbithole.contents', contents);
            w.localStorage.setItem('rabbithole.focus-mode', focus);
            w.localStorage.setItem('rabbithole.vim', vim ? 'on' : 'off');
            // Pacing is covered by the discussion card tests; here every discussion line counts as seen.
            for (const a of artifacts)
                if (a.discussion)
                    w.localStorage.setItem(`rabbithole.discussion-seen.${a.id}`, '99');
            w.DOMMatrixReadOnly = class {
                m22 = 1;
            };
        },
    );
    t.after(async () => {
        await page.cleanup();
    });
    const settle = () =>
        page.act(async () => {
            stubs.frames();
        });
    await settle();
    return { ...page, calls, settle, scrolls };
}

export const summary = {
    id: 't1',
    title: 'Fungi',
    parent: null,
    layout: { folded: [], selected: 't1', panel: 'beside' },
};
