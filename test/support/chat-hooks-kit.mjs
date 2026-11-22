// Shared mount for chat hook tests: the ChatPage hook composition over a fake server.
import { createElement as h } from 'react';
import { render } from './render.mjs';
import { ui } from './ui.mjs';
import { fakeServer } from './fake-server.mjs';

const [
    { useChatState },
    { useLearningTrees },
    { useChatModel },
    { useReplyStream },
    { useBranchForm },
    { useTreeActions },
] = await Promise.all([
    import('../../src/chat/useChatState.ts'),
    import('../../src/chat/useLearningTrees.ts'),
    import('../../src/chat/useChatModel.ts'),
    import('../../src/chat/useReplyStream.ts'),
    import('../../src/chat/useBranchForm.ts'),
    import('../../src/chat/useTreeActions.ts'),
]);

export const conversation = (id) => ({
    id,
    title: id,
    provider: 'claude',
    model: 'opus',
    effort: 'high',
    branch: null,
    artifacts: [],
    messages: [],
});
export const summary = (id, parent = null) => ({
    id,
    title: id,
    parent,
    created: 0,
    layout: { folded: [], selected: id, panel: 'beside' },
});
export const deferred = () => Promise.withResolvers();
export const json = (body, ok = true) => ({ ok, json: async () => structuredClone(body) });

// Mount the same hook composition as ChatPage without the map or media DOM.
export async function mount(t, intercept = () => {}) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const data = new Map(['a', 'b'].map((id) => [id, conversation(id)]));
    const state = {
        csrf: 'csrf',
        auth: { connected: true, email: null },
        trees: [summary('a'), summary('b')],
        active: [],
        videos: [],
    };
    const calls = fakeServer(t, (path, body, init) => {
        const response = intercept({ path, body, init }, { data, state });
        if (response !== undefined) return response;
        if (path === '/api/state') return json(state);
        if (path === '/api/models')
            return json({
                models: [
                    {
                        provider: 'claude',
                        model: 'opus',
                        label: 'Opus',
                        isDefault: true,
                        efforts: ['high'],
                    },
                    { provider: 'codex', model: 'gpt', label: 'GPT', isDefault: true, efforts: [] },
                ],
                providers: {
                    claude: { label: 'Claude', connected: true },
                    codex: { label: 'Codex', connected: true },
                },
            });
        if (path === '/api/settings/chat')
            return json({ provider: 'claude', model: 'opus', effort: null });
        if (path.startsWith('/api/previews?')) return json({});
        if (data.has(path.split('/').at(-1))) return json(data.get(path.split('/').at(-1)));
        if (/\/(layout|prepare|unprepare|stop)$/.test(path)) return json({});
        throw new Error(`Unexpected request: ${path}`);
    });
    let current;
    function Fixture() {
        const c = useChatState();
        const trees = useLearningTrees(c);
        const layout = trees.layout;
        const model = useChatModel(c, trees);
        const stream = useReplyStream(c, trees, model, { name: 'paperback', mode: 'light' });
        const actions = useTreeActions(c, trees, model, stream);
        const branch = useBranchForm(c, trees, model, stream);
        current = { c, layout, trees, model, stream, actions, branch };
        return h('section', { ref: c.workspace });
    }
    const page = await render(h(Fixture), ui);
    t.after(async () => {
        await page.cleanup();
    });
    return {
        ...page,
        get current() {
            return current;
        },
        calls,
        data,
        state,
    };
}
