// Manual only: downloads real English language data; never included in npm test.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { tesseractOcr, OCR_UNAVAILABLE } from '../server/ocr.mjs';

if (process.env.RABBITHOLE_REAL_OCR !== '1') {
  console.log('Real OCR skipped. Opt in with npm run test:ocr (downloads English language data).');
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'rabbithole-real-ocr-'));
const image = readFileSync(new URL('../test/fixtures/ocr.png', import.meta.url));
let requests = 0;
const offline = http.createServer((req, res) => {
  requests++;
  res.writeHead(503);
  res.end();
});
await new Promise((resolve) => offline.listen(0, '127.0.0.1', resolve));
const langPath = `http://127.0.0.1:${offline.address().port}`;
const options = { langPath };
const recognize = tesseractOcr(dir, options);
let cached;
try {
  await assert.rejects(recognize(image), { message: OCR_UNAVAILABLE, unavailable: true });
  console.log('PASS: failed language download refuses OCR without an uncaught error.');

  // Same recogniser, next send: restore the default CDN and let English download.
  delete options.langPath;
  assert.match(await recognize(image), /Binary heaps/i);
  const cache = join(dir, 'ocr', 'eng.traineddata');
  assert.ok(statSync(cache).size > 0);
  await recognize.stop();
  console.log(
    'PASS: next send retries, recognises the fixture and caches English under the data directory.',
  );

  // A fresh worker with downloads unavailable must read the persisted cache.
  const before = requests;
  cached = tesseractOcr(dir, { langPath });
  const results = await Promise.all([cached(image), cached(image)]);
  for (const text of results) assert.match(text, /Binary heaps/i);
  assert.equal(requests, before, 'cached OCR makes no language-data request');
  console.log(
    'PASS: restarted worker reads English from cache offline; concurrent requests complete.',
  );
  console.log(`Real OCR passed. Temporary data: ${dir}`);
} finally {
  await recognize.stop();
  await cached?.stop();
  await new Promise((resolve) => offline.close(resolve));
}
