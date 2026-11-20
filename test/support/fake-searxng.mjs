import { createServer } from 'node:http';

export async function fakeSearxng(t) {
    const fake = { hits: [], status: 200, data: { results: [] } };
    const server = createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        fake.hits.push(url);
        if (fake.reply) return fake.reply(req, res);
        res.writeHead(fake.status, { 'Content-Type': 'application/json' });
        res.end(typeof fake.data === 'string' ? fake.data : JSON.stringify(fake.data));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    fake.url = `http://127.0.0.1:${server.address().port}/instance`;
    return fake;
}
