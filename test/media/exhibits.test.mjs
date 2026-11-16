import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchExhibit, imageType } from '../../server/media/exhibits.mjs';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), Buffer.alloc(64, 7)]);

// A fake image host: /photo.png is a PNG, /moved redirects to it, /page.html is not an image, /gone is 404.
async function host(run) {
  const server = http.createServer((req, res) => {
    if (req.url === '/photo.png') res.writeHead(200, { 'Content-Type': 'text/plain' }).end(png);
    else if (req.url === '/moved') res.writeHead(302, { Location: '/photo.png' }).end();
    else if (req.url === '/page.html')
      res.writeHead(200, { 'Content-Type': 'image/png' }).end('<html>not an image</html>');
    else res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}
const local = { isPublic: () => true };
const searching = (results, seen = []) => ({
  run: async (input, _options, images) => {
    seen.push({ query: input.query, images });
    return JSON.stringify({ results });
  },
});

test('an image exhibit is image-searched, downloaded and recorded with its URL, title and site', async () => {
  await host(async (origin) => {
    const seen = [];
    const search = searching(
      [
        { imageUrl: `${origin}/gone`, title: 'Broken', sourceUrl: 'https://broken.example/a' },
        { imageUrl: `${origin}/page.html`, title: 'Fake', sourceUrl: 'https://fake.example/a' },
        { imageUrl: `${origin}/moved`, title: 'Ada Lovelace portrait', sourceUrl: 'https://www.museum.example/ada' },
      ],
      seen,
    );
    const e = await fetchExhibit({ kind: 'image', query: 'Ada Lovelace portrait', show: 'Ada' }, { search, ...local });
    assert.deepEqual(seen, [{ query: 'Ada Lovelace portrait', images: true }]);
    assert.equal(e.kind, 'image');
    assert.equal(e.url, `${origin}/moved`);
    assert.equal(e.title, 'Ada Lovelace portrait');
    assert.equal(e.site, 'museum.example');
    assert.equal(e.type, 'image/png');
    assert.ok(e.bytes.equals(png));
  });
});

test('an image exhibit fails when no result downloads as an image, so the caller drops it', async () => {
  await host(async (origin) => {
    const search = searching([{ imageUrl: `${origin}/page.html`, title: 'Fake', sourceUrl: 'https://f.example' }]);
    await assert.rejects(
      fetchExhibit({ kind: 'image', query: 'x', show: 'x' }, { search, ...local }),
      /not a PNG, JPEG, GIF or WebP image/,
    );
    await assert.rejects(
      fetchExhibit({ kind: 'image', query: 'x', show: 'x' }, { search: searching([]), ...local }),
      /no search results/,
    );
  });
  // Without the test override, private addresses are refused like read_page refuses them.
  const search = searching([{ imageUrl: 'http://127.0.0.1:9/p.png', title: 'Local', sourceUrl: 'http://127.0.0.1/' }]);
  await assert.rejects(fetchExhibit({ kind: 'image', query: 'x', show: 'x' }, { search }), /refuses/);
});

test('a quote exhibit credits the web result that shows it, else the top result', async () => {
  const results = [
    { title: 'Quotes', url: 'https://quotes.example/a', snippet: 'Something else entirely.' },
    { title: 'Notes on the Engine', url: 'https://www.archive.example/notes', snippet: '… the Analytical Engine weaves algebraic patterns …' },
  ];
  const seen = [];
  const quote = { kind: 'quote', query: 'Lovelace weaves algebraic patterns', text: 'The Analytical Engine weaves algebraic patterns', by: 'Ada Lovelace' };
  const e = await fetchExhibit(quote, { search: searching(results, seen) });
  assert.deepEqual(seen, [{ query: quote.query, images: false }]);
  assert.deepEqual(e, {
    kind: 'quote',
    text: quote.text,
    by: 'Ada Lovelace',
    url: 'https://www.archive.example/notes',
    title: 'Notes on the Engine',
    site: 'archive.example',
  });
  const top = await fetchExhibit({ ...quote, text: 'Unmatched words' }, { search: searching(results) });
  assert.equal(top.url, 'https://quotes.example/a');
});

test('image types come from the bytes, never SVG', () => {
  assert.equal(imageType(png), 'image/png');
  assert.equal(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(imageType(Buffer.from('GIF89a')), 'image/gif');
  assert.equal(imageType(Buffer.from('RIFF0000WEBPVP8 ')), 'image/webp');
  assert.equal(imageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
});
