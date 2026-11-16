import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { writeFile } from 'node:fs/promises';
import { fetchExhibit, imageType } from '../../server/media/exhibits.mjs';
import { downloadClip } from '../../server/media/clips.mjs';

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
  run: async (input, _options, category) => {
    seen.push({ query: input.query, category });
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
    assert.deepEqual(seen, [{ query: 'Ada Lovelace portrait', category: 'images' }]);
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
  assert.deepEqual(seen, [{ query: quote.query, category: undefined }]);
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

const clips = { ready: true, ytDlp: '/venv/bin/yt-dlp', ffmpeg: 'ffmpeg' };
const publicLookup = (_host, _options, callback) => callback(null, [{ address: '93.184.215.14', family: 4 }]);
const clipPlan = { kind: 'clip', query: 'Apollo 11 landing footage', show: 'The landing', start: 30, end: 36 };

test('a clip exhibit is video-searched, downloaded and trimmed by the downloader, and recorded with its source', async () => {
  const seen = [],
    asked = [];
  const search = searching(
    [
      { title: 'Broken', url: 'https://broken.example/v', snippet: '' },
      { title: 'Apollo 11 landing', url: 'https://www.video.example/watch?v=1', snippet: '' },
    ],
    seen,
  );
  const clip = async (wanted, options) => {
    asked.push(wanted);
    assert.equal(options.clips, clips);
    if (wanted.url.includes('broken')) throw new Error('downloader exited 1');
    return Buffer.from('mp4 bytes');
  };
  const e = await fetchExhibit(clipPlan, { search, clips, clip, lookup: publicLookup });
  assert.deepEqual(seen, [{ query: clipPlan.query, category: 'videos' }]);
  assert.deepEqual(asked, [
    { url: 'https://broken.example/v', start: 30, end: 36 },
    { url: 'https://www.video.example/watch?v=1', start: 30, end: 36 },
  ]);
  assert.deepEqual(e, {
    kind: 'clip',
    url: 'https://www.video.example/watch?v=1',
    title: 'Apollo 11 landing',
    site: 'video.example',
    seconds: 6,
    bytes: Buffer.from('mp4 bytes'),
    type: 'video/mp4',
  });
});

test('a clip exhibit fails, so the caller drops it, when downloads fail, the host is private or there is no downloader', async () => {
  const search = searching([{ title: 'V', url: 'https://v.example/1', snippet: '' }]);
  const failing = async () => {
    throw new Error('downloader exited 1');
  };
  await assert.rejects(
    fetchExhibit(clipPlan, { search, clips, clip: failing, lookup: publicLookup }),
    /downloader exited 1/,
  );
  const privateLookup = (_h, _o, callback) => callback(null, [{ address: '127.0.0.1', family: 4 }]);
  await assert.rejects(
    fetchExhibit(clipPlan, { search, clips, clip: assert.fail, lookup: privateLookup }),
    /non-public clip host/,
  );
  await assert.rejects(
    fetchExhibit(clipPlan, { search, clips: { ready: false, error: 'yt-dlp missing' }, clip: assert.fail }),
    /yt-dlp missing/,
  );
});

test('the downloader fetches the planned section with yt-dlp, then ffmpeg trims it muted to those seconds', async () => {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, args]);
    if (command === clips.ytDlp)
      await writeFile(args[args.indexOf('-o') + 1].replace('%(ext)s', 'webm'), 'source');
    else await writeFile(args.at(-1), 'trimmed');
  };
  const bytes = await downloadClip({ url: 'https://v.example/1', start: 30, end: 36 }, { clips, run });
  assert.equal(bytes.toString(), 'trimmed');
  const [[yt, ytArgs], [ff, ffArgs]] = calls;
  assert.equal(yt, clips.ytDlp);
  assert.deepEqual(ytArgs.slice(ytArgs.indexOf('--download-sections'), ytArgs.indexOf('--download-sections') + 2), ['--download-sections', '*30-36']);
  assert.deepEqual(ytArgs.slice(-2), ['--', 'https://v.example/1']);
  assert.equal(ff, 'ffmpeg');
  assert.match(ffArgs[ffArgs.indexOf('-i') + 1], /source\.webm$/);
  assert.equal(ffArgs[ffArgs.indexOf('-t') + 1], '6');
  assert.ok(ffArgs.includes('-an'));
  // The download leaves nothing behind, and a downloader that saves nothing is a failure.
  await assert.rejects(downloadClip({ url: 'https://v.example/1', start: 0, end: 2 }, { clips, run: async () => {} }), /saved no video/);
});
