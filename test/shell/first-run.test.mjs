import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
import { fakeServer } from '../support/fake-server.mjs';

// A fresh install: no trees unless `tree`, no chat model, nothing signed in until `signedIn`.
async function mount(
    t,
    {
        tree,
        firstRun = true,
        signedIn = true,
        cli = { missing: false },
        system = { body: {} },
        sandbox = { windows: false, ready: true },
    } = {},
) {
    const posts = [];
    const addons = [
        ['video-tools', 'Video tools', 500e6, 'offline-python'],
        ['offline-python', 'Offline Python', 50e6, null],
        ['web-search', 'Web search', 40e6, null],
    ].map(([id, name, size, dependency]) => ({
        id,
        name,
        enables: `${name} enables.`,
        size,
        dependency,
        state: 'not-installed',
        percent: null,
    }));
    // Installing queues the add-on and its dependency, as the download manager does.
    const install = (id) => {
        const { dependency } = addons.find((a) => a.id === id);
        for (const a of addons)
            if (a.id === id || a.id === dependency)
                Object.assign(a, { state: 'downloading', percent: 0 });
        return addons.map((a) => ({ ...a }));
    };
    fakeServer(t, (path, _body, options) => {
        if (options?.method === 'POST') posts.push([path, JSON.parse(options.body)]);
        const body =
            path === '/api/downloads/addons'
                ? addons.map((a) => ({ ...a }))
                : path.startsWith('/api/downloads/addons/')
                  ? install(path.split('/').at(-1))
                  : path === '/api/state'
                    ? {
                          csrf: 'c',
                          auth: { connected: false, email: null },
                          trees: tree ? [{ id: tree.id, title: tree.title, parent: null }] : [],
                          active: [],
                          videos: [],
                          firstRun,
                      }
                    : path === '/api/models'
                      ? cli.missing
                          ? {
                                models: [],
                                providers: {
                                    claude: {
                                        label: 'Claude',
                                        connected: false,
                                        installed: false,
                                        command: 'curl -fsSL https://claude.ai/install.sh | bash',
                                    },
                                },
                            }
                          : signedIn
                            ? {
                                  models: [
                                      {
                                          provider: 'claude',
                                          model: 'haiku',
                                          label: 'Haiku',
                                          efforts: [],
                                      },
                                      {
                                          provider: 'claude',
                                          model: 'opus',
                                          label: 'Opus',
                                          isDefault: true,
                                          efforts: [],
                                      },
                                  ],
                                  providers: { claude: { label: 'Claude', connected: true } },
                              }
                            : {
                                  models: [],
                                  providers: { claude: { label: 'Claude', connected: false } },
                              }
                      : path === '/api/settings/chat'
                        ? options?.method === 'POST'
                            ? JSON.parse(options.body)
                            : { provider: null, model: null, effort: null }
                        : path === '/api/setup'
                          ? { firstRun: false }
                          : path === `/api/trees/${tree?.id}`
                            ? tree
                            : path === '/api/setup/system'
                              ? system.body
                              : path === '/api/setup/sandbox'
                                ? sandbox
                                : {};
        return { ok: true, json: async () => body };
    });
    const { default: ChatPage } = await import('../../src/shell/ChatPage.tsx');
    let stubs;
    const page = await render(
        h(ChatPage, { appearance: 'light', setAppearance() {}, theme: 'neutral', setTheme() {} }),
        (w) => {
            stubs = ui(w);
            w.DOMMatrixReadOnly = class {
                m22 = 1;
            };
        },
    );
    t.after(async () => {
        await page.cleanup();
    });
    const settle = () => page.act(async () => stubs.frames());
    await settle();
    const click = async (label) => {
        await page.act(async () => button(page.container, label).click());
        await settle();
    };
    // Leaves sign-in for the add-ons step, then leaves setup with nothing installed.
    const skipAddOns = async () => {
        await click('Continue');
        await click('Skip');
    };
    return { ...page, posts, click, skipAddOns };
}

const setupPosts = (posts) => posts.filter(([path]) => !path.startsWith('/api/downloads'));

test('a fresh install opens on setup; confirming the prefilled default model lets the learner ask', async (t) => {
    const { container, posts, click, skipAddOns } = await mount(t);
    assert.ok(container.querySelector('.first-run'));
    assert.equal(container.querySelector('.first-question'), null);
    assert.match(
        container.querySelector('.first-run').textContent,
        /Signed in through Claude Code/,
    );
    assert.deepEqual(
        [...container.querySelectorAll('.first-run .connection-status')].map((e) => [
            e.textContent,
            e.dataset.state,
        ]),
        [
            ['Connected', undefined],
            ['Not set up', 'off'],
        ],
        'one provider is enough, so the other is not an error',
    );
    assert.match(
        container.querySelector('.first-run').textContent,
        /Optional\. Sign in with your ChatGPT account/,
    );
    assert.match(container.querySelector('[aria-label="Chat model"]').textContent, /Opus/);
    assert.doesNotMatch(
        container.textContent,
        /Video sandbox|administrator/,
        'Linux has no sandbox step',
    );
    await skipAddOns();
    assert.deepEqual(posts, [
        ['/api/settings/chat', { provider: 'claude', model: 'opus', effort: null }],
        ['/api/setup', {}],
    ]);
    assert.equal(container.querySelector('.first-run'), null);
    assert.match(container.querySelector('.chat-model').textContent, /Claude · Opus/);
    assert.doesNotMatch(container.textContent, /Choose a chat model in Settings/);
    const input = container.querySelector('[aria-label="Your question"]');
    assert.ok(
        input &&
            input.getAttribute('aria-disabled') !== 'true' &&
            !input.closest('[aria-disabled=true]'),
    );
});

test('"Set up later" ends setup without a model and falls back to the Send gate', async (t) => {
    const { container, posts, click } = await mount(t, { signedIn: false });
    assert.ok(button(container, 'Continue').disabled, 'no model until a provider signs in');
    assert.match(container.textContent, /Sign in to either one to pick a chat model/);
    assert.doesNotMatch(container.textContent, /Optional\./, 'neither provider is connected');
    assert.ok(button(container, 'Continue with ChatGPT'));
    assert.ok(button(container, 'Check again'));
    await click('Set up later');
    assert.deepEqual(posts, [['/api/setup', {}]]);
    assert.equal(container.querySelector('.first-run'), null);
    assert.match(container.textContent, /Choose a chat model in Settings/);
});

test('an ended or upgraded install opens on the first question, not setup', async (t) => {
    const { container } = await mount(t, { firstRun: false });
    assert.equal(container.querySelector('.first-run'), null);
    assert.ok(container.querySelector('.first-question'));
});

test('a missing CLI installs from setup: a failure shows its last line and Retry, and a finished install moves setup on', async (t) => {
    const sources = [];
    globalThis.EventSource = class {
        constructor(url) {
            this.url = url;
            sources.push(this);
        }
        close() {}
    };
    t.after(() => delete globalThis.EventSource);
    const cli = { missing: true };
    const { container, click, act, posts } = await mount(t, { cli });
    const setup = container.querySelector('.first-run');
    assert.equal(setup.querySelector('.connection-status').textContent, 'Not set up');
    assert.match(setup.textContent, /curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash/);
    assert.ok(setup.querySelector('a[href="https://code.claude.com/docs/en/setup"]'));
    // The server's install row, as the download stream sends it.
    const row = (state, error) =>
        act(async () =>
            sources.at(-1).onmessage({
                data: JSON.stringify([{ id: 'claude', name: 'Claude Code', state, error }]),
            }),
        );
    await click('Install Claude Code');
    assert.deepEqual(posts.at(-1), ['/api/downloads/install/claude', {}]);
    assert.ok(setup.querySelector('[role="progressbar"]'), 'the install shows progress');
    await row('failed', 'curl: (6) Could not resolve host: claude.ai');
    assert.match(setup.querySelector('[role="alert"]').textContent, /Could not resolve host/);
    await click('Retry installing Claude Code');
    assert.equal(posts.filter(([p]) => p === '/api/downloads/install/claude').length, 2);
    cli.missing = false;
    await row('ready');
    await act(async () => {});
    assert.doesNotMatch(container.textContent, /not installed/);
    assert.match(
        container.querySelector('.first-run').textContent,
        /Signed in through Claude Code/,
        'setup moves on without Check again',
    );
});

test('Linux setup shows the one install line while packages are missing; "Check again" clears it and chat still starts', async (t) => {
    const command =
        'sudo apt install bubblewrap libcairo2-dev libpango1.0-dev pkg-config python3-dev build-essential';
    const system = { body: { command } };
    const { container, posts, click, skipAddOns } = await mount(t, { system });
    const setup = () => container.querySelector('.first-run');
    assert.match(
        setup().textContent,
        /Video making needs a few system packages; chat works without them/,
    );
    assert.equal(setup().querySelector('code').textContent, command);
    system.body = {};
    await click('Check again');
    assert.doesNotMatch(setup().textContent, /Video tools|sudo apt/);
    await skipAddOns();
    assert.deepEqual(posts.at(-1), ['/api/setup', {}]);
    assert.equal(setup(), null);
});

test('with bundled tools setup shows only the bubblewrap line and "Check again"', async (t) => {
    const system = { body: { command: 'sudo apt install bubblewrap' } };
    const { container, click } = await mount(t, { system });
    const setup = () => container.querySelector('.first-run');
    assert.equal(setup().querySelector('code').textContent, 'sudo apt install bubblewrap');
    assert.doesNotMatch(setup().textContent, /pkg-config|libcairo|build-essential/);
    system.body = {};
    await click('Check again');
    assert.doesNotMatch(setup().textContent, /Video tools|sudo apt/);
});

test('other distros get the package list in words; setup still ends with the line unresolved', async (t) => {
    const { container, skipAddOns } = await mount(t, {
        system: { body: { words: 'bubblewrap, pkg-config and the Cairo headers' } },
    });
    const text = container.querySelector('.first-run').textContent;
    assert.match(
        text,
        /Install bubblewrap, pkg-config and the Cairo headers with your distribution's package manager/,
    );
    assert.doesNotMatch(text, /sudo apt/);
    await skipAddOns();
    assert.equal(container.querySelector('.first-run'), null);
    assert.ok(container.querySelector('[aria-label="Your question"]'));
});

test('Windows setup asks once for admin rights; declining explains and setup still ends', async (t) => {
    const { container, posts, click, skipAddOns } = await mount(t, {
        sandbox: { windows: true, ready: false },
    });
    const setup = () => container.querySelector('.first-run');
    assert.match(setup().textContent, /Video sandbox.*asks once for administrator rights/);
    await click('Enable sandbox');
    assert.deepEqual(posts, [['/api/setup/sandbox', {}]]);
    assert.match(
        setup().textContent,
        /Video making stays off until it is enabled; you can try again from Settings/,
    );
    assert.equal(
        [...setup().querySelectorAll('button')].find((b) =>
            /Enable sandbox|Try again/.test(b.textContent),
        ),
        undefined,
        'setup asks only once',
    );
    await skipAddOns();
    assert.deepEqual(posts.at(-1), ['/api/setup', {}]);
    assert.equal(setup(), null);
});

test('setup ends with every add-on; Skip installs nothing and says where to find them later', async (t) => {
    const { container, posts, click } = await mount(t);
    await click('Continue');
    const setup = container.querySelector('.first-run');
    assert.equal(container.ownerDocument.activeElement.textContent, 'Add what you need');
    assert.deepEqual(
        [...setup.querySelectorAll('.addon')].map((r) => r.querySelector('button')?.textContent),
        ['Install', 'Install', 'Install'],
    );
    assert.match(setup.textContent, /About 500 MBAlso installs offline Python/);
    assert.match(setup.textContent, /later in Settings, under Add-ons/);
    await click('Skip');
    assert.deepEqual(setupPosts(posts), posts, 'no add-on was installed');
    assert.equal(container.querySelector('.first-run'), null);
});

test('Install on a row starts its download and the learner can start chatting at once', async (t) => {
    const { container, posts, click } = await mount(t);
    await click('Continue');
    await click('Install Video tools');
    assert.deepEqual(posts.at(-1), ['/api/downloads/addons/video-tools', {}]);
    const setup = container.querySelector('.first-run');
    assert.deepEqual(
        [...setup.querySelectorAll('[data-state=live]')].map((e) => e.textContent),
        ['Waiting for offline Python', 'Downloading 0%'],
    );
    assert.ok(button(container, 'Install Web search'));
    assert.ok(button(container, 'Install all · about 40 MB'), 'covers only what is left');
    assert.equal(button(container, 'Skip'), undefined);
    assert.match(setup.textContent, /Downloads keep going while you chat/);
    await click('Start chatting');
    assert.deepEqual(posts.at(-1), ['/api/setup', {}]);
    assert.equal(container.querySelector('.first-run'), null);
});

test('Install all starts every download and leaves only Start chatting', async (t) => {
    const { container, posts, click } = await mount(t);
    await click('Continue');
    await click('Install all · about 590 MB');
    assert.deepEqual(
        posts.map(([path]) => path).filter((p) => p.startsWith('/api/downloads')),
        [
            '/api/downloads/addons/video-tools',
            '/api/downloads/addons/offline-python',
            '/api/downloads/addons/web-search',
        ],
    );
    const setup = container.querySelector('.first-run');
    assert.equal(setup.querySelectorAll('[data-state=live][role=status]').length, 3);
    assert.deepEqual(
        [...setup.querySelectorAll('button')].map((b) => b.textContent),
        ['Back', 'Start chatting'],
    );
});

test('with no model connected, an open conversation says so inside its composer', async (t) => {
    const tree = {
        id: 't1',
        title: 'Fungi',
        provider: 'claude',
        model: 'opus',
        effort: null,
        branch: null,
        artifacts: [],
        messages: [],
    };
    const { container } = await mount(t, { tree, firstRun: false, signedIn: false });
    const note = container.querySelector('.focused-chat .astryx-chat-composer .attachment-note');
    assert.equal(note.textContent, 'No model is connected. Open Settings, then Connections.');
    assert.equal(note.getAttribute('role'), null, 'not an alert');
});
