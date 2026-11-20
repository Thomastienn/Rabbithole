import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeSearxng } from '../support/fake-searxng.mjs';
import { searxngSearch, searxngUrl } from '../../server/tools/searxng.mjs';
import { toolRunner } from '../../server/tools/runner.mjs';

function client(fake) {
    let url = null;
    return searxngSearch({
        managed: () => ({ ready: true, url: fake.url, error: null }),
        store: {
            searxngUrl: () => url,
            saveSearxngUrl: (value) => {
                url = value;
            },
        },
    });
}

test('runner offers reachable search tools by provider and returns web and image results', async (t) => {
    const fake = await fakeSearxng(t);
    fake.data.results = [
        {
            title: 'Heap',
            url: 'https://example.org/heaps',
            content: 'Smallest at root.',
            img_src: 'https://images.example.org/heap.png',
            thumbnail_src: 'https://images.example.org/small.png',
        },
        { title: 'Bad', url: 'javascript:alert(1)', img_src: 'https://example.org/image.png' },
        { title: 'No image', url: 'https://example.org/text' },
        null,
    ];
    const search = client(fake),
        runner = toolRunner({ search });
    const names = async (provider, capable = true) =>
        (await runner.tools({ provider, capable })).map((d) => d.name);
    assert.deepEqual(await names('openai:123'), ['web_search', 'find_images', 'read_page']);
    assert.deepEqual(await names('claude'), ['find_images']);
    assert.deepEqual(await names('codex'), ['find_images', 'read_page']);
    assert.deepEqual(await names('openai', false), []);
    const turn = { signal: new AbortController().signal };
    assert.deepEqual(
        JSON.parse(await runner.run('web_search', { query: 'binary heap & arrays' }, turn)),
        {
            results: [
                { title: 'Heap', url: 'https://example.org/heaps', snippet: 'Smallest at root.' },
                { title: 'No image', url: 'https://example.org/text', snippet: '' },
            ],
        },
    );
    assert.deepEqual(JSON.parse(await runner.run('find_images', { query: 'binary heap' }, turn)), {
        results: [
            {
                imageUrl: 'https://images.example.org/heap.png',
                thumbnail: 'https://images.example.org/small.png',
                title: 'Heap',
                sourceUrl: 'https://example.org/heaps',
            },
        ],
    });
    assert.ok(
        fake.hits.every(
            (u) => u.pathname === '/instance/search' && u.searchParams.get('format') === 'json',
        ),
    );
    assert.equal(fake.hits.at(-1).searchParams.get('categories'), 'images');
    assert.equal(fake.hits.at(-2).searchParams.get('q'), 'binary heap & arrays');
    assert.equal(fake.hits.at(-2).searchParams.has('categories'), false);
    fake.status = 503;
    for (const provider of ['openai', 'claude', 'codex']) {
        assert.deepEqual(await names(provider), provider === 'claude' ? [] : ['read_page']);
    }
    fake.status = 200;
    fake.data = { results: [] };
    assert.equal((await search.status()).ready, true, 'recovers without restarting the app');
});

test('JSON-disabled, invalid JSON/schema, HTTP and network failures have specific diagnoses', async (t) => {
    const fake = await fakeSearxng(t),
        search = client(fake);
    for (const [status, data, error] of [
        [403, {}, /JSON.*403.*Enable json/],
        [200, '<html>Search</html>', /did not return JSON.*Enable json/],
        [200, { error: 'bad' }, /no results list/],
        [429, {}, /HTTP 429/],
    ]) {
        fake.status = status;
        fake.data = data;
        const result = await search.status();
        assert.equal(result.ready, false);
        assert.match(result.error, error);
        await assert.rejects(search.run({ query: 'heap' }, {}), error);
    }
    search.save('http://127.0.0.1:1');
    assert.match((await search.status()).error, /Cannot reach SearXNG/);
    search.save(null);
    assert.equal((await search.status()).url, fake.url);
});

test('only Settings selects a validated URL; queries are bounded, results capped and Stop cancels transport', async (t) => {
    for (const value of [
        undefined,
        7,
        'file:///tmp/x',
        'http://user:x@example.org',
        'http://host/?key=x',
        'http://host/#x',
    ])
        assert.throws(() => searxngUrl(value), /HTTP\(S\)/);
    assert.equal(searxngUrl('https://example.org/base/'), 'https://example.org/base');
    assert.equal(searxngUrl(null), null);
    const fake = await fakeSearxng(t),
        search = client(fake);
    for (const query of [null, '', ' ', 'x'.repeat(2001)])
        await assert.rejects(search.run({ query }, {}), /nonempty query/);
    fake.data = {
        results: Array.from({ length: 15 }, (_, i) => ({
            title: `Title ${i}`,
            url: `https://example.org/${i}`,
        })),
    };
    assert.equal(JSON.parse(await search.run({ query: 'x' }, {})).results.length, 10);
    const controller = new AbortController();
    let received;
    const started = new Promise((resolve) => {
        received = resolve;
    });
    let closed;
    const ended = new Promise((resolve) => {
        closed = resolve;
    });
    fake.reply = (req, res) => {
        res.once('close', closed);
        received();
    };
    const running = search.run({ query: 'x' }, { signal: controller.signal });
    await started;
    controller.abort();
    await assert.rejects(running, { name: 'AbortError' });
    await ended;
    await assert.rejects(search.status({ signal: controller.signal }), { name: 'AbortError' });
});
