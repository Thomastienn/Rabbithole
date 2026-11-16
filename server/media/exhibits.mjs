// The exhibit fetcher: turns a planned exhibit into data for its cut (ADR 0005). Images are downloaded on the
// server through the public-address checks read_page uses, so cut code and its sandbox stay offline.
import { lookup as dnsLookup } from 'node:dns';
import { request, body, publicAddress } from '../tools/readPage.mjs';

const MAX_IMAGE = 3 * 1024 * 1024,
  TRIES = 3;

const site = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// The image type from its first bytes; headers are not trusted and SVG is refused.
export function imageType(bytes) {
  const head = bytes.subarray(0, 12);
  if (head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
  if (head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (head.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}

async function download(url, { signal, lookup, isPublic }) {
  const timed = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  let target = new URL(url);
  for (let redirects = 0; ; redirects++) {
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('not an http(s) image');
    const response = await request(target, timed, lookup, isPublic);
    const location = response.headers.location;
    if (response.statusCode >= 300 && response.statusCode < 400 && location && redirects < 5) {
      response.destroy();
      target = new URL(location, target);
      continue;
    }
    if (response.statusCode >= 300) {
      response.destroy();
      throw new Error(`image returned HTTP ${response.statusCode}`);
    }
    const bytes = await body(response, MAX_IMAGE);
    const type = imageType(bytes);
    if (!type) throw new Error('not a PNG, JPEG, GIF or WebP image');
    return { bytes, type };
  }
}

// One planned exhibit to {kind, url, title, site, text?, by?, bytes?, type?}; any failure throws, and the
// caller drops the exhibit. search is the SearXNG tool (run(input, options, images)).
export async function fetchExhibit(
  planned,
  { search, signal, lookup = dnsLookup, isPublic = publicAddress },
) {
  const { results } = JSON.parse(
    await search.run({ query: planned.query }, { signal }, planned.kind === 'image'),
  );
  if (!results.length) throw new Error(`no search results for "${planned.query}"`);
  if (planned.kind === 'quote') {
    // Credit the result that shows the quote when one does; otherwise the top result for its query.
    const plain = (s) => s.toLowerCase().replace(/\W+/g, ' ').trim();
    const r =
      results.find((r) => plain(`${r.title} ${r.snippet}`).includes(plain(planned.text))) ??
      results[0];
    return {
      kind: 'quote',
      text: planned.text,
      ...(planned.by && { by: planned.by }),
      url: r.url,
      title: r.title,
      site: site(r.url),
    };
  }
  let last;
  for (const r of results.slice(0, TRIES))
    try {
      return {
        kind: 'image',
        url: r.imageUrl,
        title: r.title,
        site: site(r.sourceUrl),
        ...(await download(r.imageUrl, { signal, lookup, isPublic })),
      };
    } catch (error) {
      signal?.throwIfAborted();
      last = error;
    }
  throw last;
}
