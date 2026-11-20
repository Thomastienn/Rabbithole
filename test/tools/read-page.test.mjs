import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { isIP } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPage, publicAddress, PAGE_SIZE } from '../../server/tools/readPage.mjs';
import { toolRunner } from '../../server/tools/runner.mjs';

const ARTICLE = `<html><head><title>Binary heaps</title><script>window.secret = 'script text'</script></head>
<body><nav>Home | About | Login</nav><article><h1>Binary heaps</h1>
<p>A binary heap is a complete binary tree where every parent is ordered before its children.</p>
<p>Insertion sifts the new key up; removing the root sifts the last key down. Both take logarithmic time.</p>
<p>Heaps back priority queues and heapsort, and are stored compactly in an array.</p></article></body></html>`;

// A local page server reached through fake DNS names, so the real address check still runs on every other address.
async function pageServer(t) {
    const hits = [],
        bodyStarted = Promise.withResolvers();
    const server = createServer((req, res) => {
        hits.push(req.url);
        const port = server.address().port;
        const routes = {
            '/article': () => res.writeHead(200, { 'Content-Type': 'text/html' }).end(ARTICLE),
            '/long': () =>
                res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ab'.repeat(22500)),
            '/huge': () =>
                res
                    .writeHead(200, { 'Content-Type': 'text/plain' })
                    .end('x'.repeat(6 * 1024 * 1024)),
            '/body': () => {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.write('<p>');
                bodyStarted.resolve();
            },
            '/to-article': () => res.writeHead(302, { Location: '/article' }).end(),
            '/to-lan': () =>
                res.writeHead(302, { Location: `http://lan.test:${port}/article` }).end(),
            '/to-private': () => res.writeHead(301, { Location: `http://10.0.0.7:${port}/` }).end(),
            '/to-loopback': () =>
                res.writeHead(307, { Location: `http://loop.test:${port}/` }).end(),
            '/to-file': () => res.writeHead(302, { Location: 'file:///etc/passwd' }).end(),
            '/loop': () => res.writeHead(302, { Location: '/loop' }).end(),
            '/image': () => res.writeHead(200, { 'Content-Type': 'image/png' }).end('PNG'),
            '/data.csv': () => res.writeHead(200, { 'Content-Type': 'text/csv' }).end('x,y\n1,2\n'),
            '/missing': () => res.writeHead(404).end(),
            '/slow': () => {},
        };
        (routes[req.url] ?? routes['/missing'])();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    const names = {
        'site.test': '127.0.0.1',
        'lan.test': '192.168.1.5',
        'loop.test': '127.0.0.53',
    };
    const lookup = (name, options, callback) => {
        const address = names[name];
        if (!address) return callback(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }));
        const family = isIP(address);
        options.all ? callback(null, [{ address, family }]) : callback(null, address, family);
    };
    const site = `http://site.test:${server.address().port}`;
    // Only the fake site's address 127.0.0.1 counts as public; every other address keeps the real check.
    const options = {
        lookup,
        isPublic: (address) => publicAddress(address) || address === '127.0.0.1',
    };
    return { hits, site, port: server.address().port, options, bodyStarted: bodyStarted.promise };
}

test('publicAddress allows global unicast and refuses loopback, private, link-local and special ranges', () => {
    for (const a of ['93.184.216.34', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8'])
        assert.equal(publicAddress(a), true, a);
    for (const a of [
        '127.0.0.1',
        '10.1.2.3',
        '172.16.0.1',
        '192.168.0.10',
        '169.254.169.254',
        '100.64.0.1',
        '0.0.0.0',
        '224.0.0.1',
        '255.255.255.255',
        '198.18.0.1',
        '::1',
        '::',
        'fe80::1',
        'fc00::1',
        'fd12:3456::1',
        'ff02::1',
        '::ffff:127.0.0.1',
        '::ffff:10.0.0.1',
        '2001:db8::1',
        '2002:7f00:1::',
        '64:ff9b::7f00:1',
        'not-an-ip',
    ])
        assert.equal(publicAddress(a), false, a);
});

test('read_page returns the readable article text with its title, without page chrome or scripts', async (t) => {
    const { site, options } = await pageServer(t);
    const out = await readPage({ url: `${site}/article` }, options);
    assert.match(out, /^URL: http:\/\/site\.test:\d+\/article\nTitle: Binary heaps\n/);
    assert.match(out, /complete binary tree/);
    assert.match(out, /priority queues and heapsort/);
    assert.doesNotMatch(out, /script text/);
    assert.doesNotMatch(out, /Home \| About/);
});

test('read_page pages long text by offset', async (t) => {
    const { site, options } = await pageServer(t);
    const first = await readPage({ url: `${site}/long` }, options);
    assert.match(
        first,
        /Characters 0–20000 of 45000\. Call read_page again with offset 20000 for more\./,
    );
    assert.equal(first.split('\n\n').at(-1).length, PAGE_SIZE);
    const last = await readPage({ url: `${site}/long`, offset: 40000 }, options);
    assert.match(last, /Characters 40000–45000 of 45000\.\n/);
    assert.doesNotMatch(last, /Call read_page again/);
    assert.equal(last.split('\n\n').at(-1).length, 5000);
    assert.match(await readPage({ url: `${site}/long`, offset: 50000 }, options), /past the end/);
    await assert.rejects(readPage({ url: `${site}/long`, offset: -1 }, options), /offset/);
});

test('read_page refuses localhost, LAN, link-local and non-http targets before any request', async (t) => {
    const { hits, port } = await pageServer(t);
    for (const url of [
        `http://localhost:${port}/article`,
        `http://127.0.0.1:${port}/article`,
        `http://0x7f000001:${port}/article`,
        `http://[::1]:${port}/article`,
        `http://[::ffff:127.0.0.1]:${port}/article`,
        'http://10.0.0.1/',
        'http://192.168.1.1/',
        'http://169.254.169.254/latest/meta-data/',
    ])
        await assert.rejects(readPage({ url }), /refuses .*only public internet addresses/, url);
    await assert.rejects(readPage({ url: 'file:///etc/passwd' }), /only reads http and https/);
    await assert.rejects(readPage({ url: 'ftp://example.com/' }), /only reads http and https/);
    await assert.rejects(readPage({ url: 'not a url' }), /full http or https URL/);
    assert.deepEqual(hits, []);
});

test('read_page re-checks every redirect and refuses non-public or non-http targets', async (t) => {
    const { site, options, hits } = await pageServer(t);
    assert.match(await readPage({ url: `${site}/to-article` }, options), /complete binary tree/);
    await assert.rejects(readPage({ url: `${site}/to-lan` }, options), /refuses lan\.test/);
    await assert.rejects(readPage({ url: `${site}/to-private` }, options), /refuses 10\.0\.0\.7/);
    await assert.rejects(
        readPage({ url: `${site}/to-file` }, options),
        /only reads http and https/,
    );
    await assert.rejects(readPage({ url: `${site}/loop` }, options), /too many redirects/);
    await assert.rejects(readPage({ url: `${site}/to-loopback` }, options), /refuses loop\.test/);
    // Only the allowed redirect target was ever fetched after a redirect.
    assert.deepEqual(
        hits.filter((h) => !h.startsWith('/to-') && h !== '/loop'),
        ['/article'],
    );
});

test('read_page reports errors and non-text content, and stops on abort', async (t) => {
    const { site, options, bodyStarted } = await pageServer(t);
    await assert.rejects(readPage({ url: `${site}/missing` }, options), /HTTP 404/);
    await assert.rejects(readPage({ url: `${site}/image` }, options), /cannot read image\/png/);
    await assert.rejects(readPage({ url: `${site}/huge` }, options), /larger than 5 MB/);
    const controller = new AbortController();
    const pending = readPage({ url: `${site}/slow` }, { ...options, signal: controller.signal });
    setImmediate(() => controller.abort());
    await assert.rejects(pending, { name: 'AbortError' });
    const reading = new AbortController();
    const body = readPage({ url: `${site}/body` }, { ...options, signal: reading.signal });
    await bodyStarted;
    reading.abort();
    await assert.rejects(body, { name: 'AbortError' });
});

test('read_page never borrows an unchecked socket from the global HTTP pool', async (t) => {
    const { site, options, hits } = await pageServer(t);
    await new Promise((resolve, reject) => {
        const req = get(`${site}/article`, { lookup: options.lookup }, (res) => {
            res.resume();
            res.on('end', resolve);
        });
        req.on('error', reject);
    });
    await new Promise(setImmediate); // let the unrestricted request return its socket to the pool
    await assert.rejects(
        readPage({ url: `${site}/article` }, { lookup: options.lookup }),
        /refuses site.test/,
    );
    assert.deepEqual(hits, ['/article']);
});

test('read_page refuses mixed public/private DNS answers before connecting', async (t) => {
    const { site, hits, options } = await pageServer(t);
    const lookup = (name, opts, done) => {
        assert.equal(opts.all, true);
        done(null, [
            { address: '127.0.0.1', family: 4 },
            { address: '10.0.0.1', family: 4 },
        ]);
    };
    await assert.rejects(readPage({ url: site }, { ...options, lookup }), /refuses site.test/);
    assert.deepEqual(hits, []);
});

test('read_page re-resolves a redirect on the same host and refuses a rebound private address', async (t) => {
    const { site, hits, options } = await pageServer(t);
    let count = 0;
    const lookup = (name, opts, done) => {
        const address = count++ ? '10.0.0.1' : '127.0.0.1';
        done(null, [{ address, family: 4 }]);
    };
    await assert.rejects(
        readPage({ url: `${site}/to-article` }, { ...options, lookup }),
        /refuses site.test/,
    );
    assert.deepEqual(hits, ['/to-article']);
});

test('tool runner: capable custom endpoint and Codex models get read_page; Claude keeps its native fetch', async (t) => {
    const runner = toolRunner();
    assert.deepEqual(
        (await runner.tools({ provider: 'openai:1', capable: true })).map((d) => d.name),
        ['read_page'],
    );
    assert.deepEqual(
        (await runner.tools({ provider: 'openai', capable: true })).map((d) => d.name),
        ['read_page'],
    );
    const [definition] = await runner.tools({ provider: 'openai', capable: true });
    assert.deepEqual(definition.parameters.required, ['url']);
    assert.match(definition.description, /cannot read local/);
    assert.deepEqual(await runner.tools({ provider: 'openai:1', capable: false }), []);
    assert.deepEqual(await runner.tools({ provider: 'claude', capable: true }), []);
    assert.deepEqual(
        (await runner.tools({ provider: 'codex', capable: true })).map((d) => d.name),
        ['read_page'],
    );
    assert.deepEqual(await runner.tools({ provider: 'codex', capable: false }), []);

    const { site, options } = await pageServer(t);
    const local = toolRunner({ readPage: options });
    const turn = { conversation: 'c', reply: 'r', signal: new AbortController().signal };
    assert.match(await local.run('read_page', { url: `${site}/article` }, turn), /Binary heaps/);
    await assert.rejects(local.run('shell', {}, turn), /Unknown tool shell/);
    await assert.rejects(local.run('toString', {}, turn), /Unknown tool/);
    await assert.rejects(local.run('read_page', '{"url"', turn), /JSON object/);
    const stopped = new AbortController();
    stopped.abort();
    await assert.rejects(
        local.run('read_page', { url: `${site}/article` }, { ...turn, signal: stopped.signal }),
        { name: 'AbortError' },
    );
});

test('read_page save_as writes the raw response into the Python workspace, any type, plain filenames only', async (t) => {
    const { site, options } = await pageServer(t);
    const workspace = join(mkdtempSync(join(tmpdir(), 'rabbithole-save-')), 'python', 'c');
    const csv = await readPage(
        { url: `${site}/data.csv`, save_as: 'data.csv' },
        { ...options, workspace },
    );
    assert.match(csv, /Saved 8 bytes as data.csv in the Python workspace/);
    assert.match(csv, /x,y/);
    assert.equal(readFileSync(join(workspace, 'data.csv'), 'utf8'), 'x,y\n1,2\n');
    const png = await readPage(
        { url: `${site}/image`, save_as: 'img.png' },
        { ...options, workspace },
    );
    assert.match(png, /Content type: image\/png\nSaved 3 bytes as img.png/);
    assert.equal(readFileSync(join(workspace, 'img.png'), 'utf8'), 'PNG');
    for (const save_as of ['../escape', '.hidden', 'a/b', '', 'x'.repeat(101), 5])
        await assert.rejects(
            readPage({ url: `${site}/data.csv`, save_as }, { ...options, workspace }),
            /plain filename/,
            String(save_as),
        );
    await assert.rejects(
        readPage({ url: `${site}/data.csv`, save_as: 'd.csv' }, options),
        /offline Python is unavailable/,
    );

    // The runner saves into the conversation's workspace under the data directory.
    const dir = mkdtempSync(join(tmpdir(), 'rabbithole-runner-'));
    const runner = toolRunner({ readPage: options, dir });
    const turn = { conversation: 'c7', reply: 'r', signal: new AbortController().signal };
    await runner.run('read_page', { url: `${site}/data.csv`, save_as: 'd.csv' }, turn);
    assert.equal(readFileSync(join(dir, 'python', 'c7', 'd.csv'), 'utf8'), 'x,y\n1,2\n');
});

test('read_page and find_images record resources of the learning tree and tell the model their numbers', async (t) => {
    const { site, options } = await pageServer(t);
    const dir = mkdtempSync(join(tmpdir(), 'tt-resource-tools-'));
    const added = [];
    const resources = {
        addResource: (conversation, r) => {
            const known = added.findIndex((a) => a.url === r.url);
            if (known >= 0) return known + 1;
            added.push({ conversation, ...r });
            return added.length;
        },
    };
    const search = {
        run: async () =>
            JSON.stringify({
                results: [
                    {
                        imageUrl: 'https://img.example/heap.png',
                        thumbnail: null,
                        title: 'Heap diagram',
                        sourceUrl: 'https://www.wiki.example/Heap',
                    },
                ],
            }),
    };
    const runner = toolRunner({ readPage: options, dir, resources, search });
    const turn = { conversation: 'c1', reply: 'r1' };
    const read = await runner.run('read_page', { url: `${site}/article` }, turn);
    assert.match(read, /^Resource 1; cite it as \[1\]\(resource:1\)\.\nURL: /);
    assert.match(
        await runner.run('read_page', { url: `${site}/article`, offset: 10 }, turn),
        /^Resource 1;/,
    );
    await runner.run('read_page', { url: `${site}/image`, save_as: 'heap.png' }, turn);
    const images = JSON.parse(await runner.run('find_images', { query: 'heap' }, turn));
    assert.equal(images.results[0].resource, 3);
    assert.deepEqual(added, [
        {
            conversation: 'c1',
            url: `${site}/article`,
            title: 'Binary heaps',
            site: 'site.test',
            kind: 'page',
        },
        {
            conversation: 'c1',
            url: `${site}/image`,
            title: 'heap.png',
            site: 'site.test',
            kind: 'file',
        },
        {
            conversation: 'c1',
            url: 'https://img.example/heap.png',
            title: 'Heap diagram',
            site: 'wiki.example',
            kind: 'image',
        },
    ]);
});
