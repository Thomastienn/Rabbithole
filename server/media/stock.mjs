import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The catalog name prefixes each asset name, so 2D IDs never collide with the 3D catalog's slugs.
const PREFIX = 'fluent-emoji:';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function fetchJson(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Rabbithole' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Rabbithole' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// A rename publishes the file whole; a failed write leaves no partial file behind.
async function writeAtomic(path, text) {
  const part = `${path}.part-${randomUUID()}`;
  await writeFile(part, text);
  await rename(part, path).catch((error) =>
    rm(part, { force: true }).then(() => Promise.reject(error)),
  );
}

// One entry per emoji: its plain Flat file, or the default skin tone's when it has tones.
export function fluentIndex(listing) {
  if (!Array.isArray(listing?.tree) || listing.truncated)
    throw new Error('the tree listing is incomplete');
  return listing.tree
    .flatMap(({ path }) => {
      const m = /^assets\/([^/]+)\/(?:Default\/)?Flat\/([^/]+?)_flat(?:_default)?\.svg$/.exec(path);
      return m ? [{ id: PREFIX + m[2], title: m[1], type: 'emoji', path }] : [];
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// The index under dir/stock; a cached index is kept only while its hash matches.
// A failed download or a built index with another hash refuses the catalog.
export async function stockIndex(dir, download = fetchJson, catalog = FLUENT) {
  const path = join(dir, 'stock', `${catalog.file}-${catalog.revision}.json`);
  const cached = await readFile(path, 'utf8').catch(() => null);
  if (cached && sha256(cached) === catalog.hash) return JSON.parse(cached);
  let text;
  try {
    text = JSON.stringify(catalog.build(await download(catalog.index(catalog))));
  } catch (error) {
    throw new Error(`Stock catalog download failed (${catalog.name}): ${error.message}`);
  }
  if (sha256(text) !== catalog.hash)
    throw new Error(`Stock catalog index (${catalog.name}) does not match its recorded hash.`);
  await mkdir(join(dir, 'stock'), { recursive: true, mode: 0o700 });
  await writeAtomic(path, text);
  return JSON.parse(text);
}

// One entry per Polyfork model; only its GLB mesh is ever fetched, never the .mjs source.
export function polyforkIndex(catalog) {
  if (!Array.isArray(catalog?.assets)) throw new Error('the catalog has no asset list');
  return catalog.assets
    .filter(
      ({ id, glb }) => /^[a-z0-9-]+$/.test(id) && glb === `https://polyfork.dev/cdn/${id}.glb`,
    )
    .map(({ id, title, type }) => ({ id, title, type }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Each hash covers the built index, so a catalog file's formatting (GitHub's JSON for Fluent's tree
// listing) does not matter while the pinned entries do.
// The 2D catalog: Fluent Emoji, flat style only; the repository has no catalog file, so the index is
// built from its git tree listing at the pinned commit.
export const FLUENT = {
  name: 'Fluent Emoji',
  file: 'fluent-emoji',
  dimension: '2D',
  repo: 'microsoft/fluentui-emoji',
  revision: '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc',
  hash: 'ef985b7627ac3f1ba05a2824c34875c72cc5935246195763ec19939ff7562993',
  index: (catalog) =>
    `https://api.github.com/repos/${catalog.repo}/git/trees/${catalog.revision}?recursive=1`,
  build: fluentIndex,
  piece: (catalog, entry) =>
    `https://raw.githubusercontent.com/${catalog.repo}/${catalog.revision}/${encodeURI(entry.path)}`,
};
// The 3D catalog: Polyfork's catalog.json at the pinned commit. Its GLB files live on polyfork.dev's
// CDN, which has no revision pin; the pinned index fixes which IDs exist.
export const POLYFORK = {
  name: 'Polyfork',
  file: 'polyfork',
  dimension: '3D',
  repo: 'lucas-martinic/polyfork-catalog',
  revision: 'e69dca94a2b9569c6454eb74c976f71443621c87',
  hash: '60c4ba16ba8e1f85edae6c990f0acf6f1cf97489952952c1726ebb62723678d4',
  index: (catalog) =>
    `https://raw.githubusercontent.com/${catalog.repo}/${catalog.revision}/catalog.json`,
  build: polyforkIndex,
  piece: (_catalog, entry) => `https://polyfork.dev/cdn/${entry.id}.glb`,
};

const STOP = new Set(['a', 'an', 'and', 'the', 'of', 'with', 'in', 'on']);
const words = (text) => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w));
// Singular and plural count as the same word.
const same = (a, b) =>
  a === b || a + 's' === b || b + 's' === a || a + 'es' === b || b + 'es' === a;

// Keyword match: most query words found first, then the title with fewest other words.
export function keywordMatch(index, name, count = 3) {
  const query = words(name);
  return index
    .map((entry) => {
      const title = words(entry.title);
      return {
        entry,
        hits: query.filter((q) => title.some((t) => same(q, t))).length,
        size: title.length,
      };
    })
    .filter((m) => m.hits)
    .sort((a, b) => b.hits - a.hits || a.size - b.size || (a.entry.id < b.entry.id ? -1 : 1))
    .slice(0, count)
    .map(({ entry: { id, title, type, dimension } }) => ({ id, title, type, dimension }));
}

// Object names in, top 3 pieces per name out, each marked 2D or 3D. An ID in, its SVG text (2D) or GLB
// bytes (3D) out; null for an unknown ID. Each index loads on first use and a failure is retried next
// call; match uses the catalogs that loaded and fails only when none did.
export function stockCatalog(
  dir,
  download,
  downloadPiece = fetchBytes,
  catalogs = [FLUENT, POLYFORK],
) {
  const loaders = catalogs.map((catalog) => {
    let loading;
    return () =>
      (loading ??= stockIndex(dir, download, catalog).then(
        (index) => index.map((entry) => ({ ...entry, dimension: catalog.dimension, catalog })),
        (error) => {
          loading = undefined;
          throw error;
        },
      ));
  });
  const load = async () => {
    const results = await Promise.allSettled(loaders.map((loader) => loader()));
    if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
    return results.flatMap((r) => r.value ?? []);
  };
  return {
    async match(names) {
      const index = await load();
      return names.map((object) => ({ object, pieces: keywordMatch(index, object) }));
    },
    // shortcut: the piece cache is never evicted, add eviction when real usage shows it grows.
    async piece(id) {
      const entry = (await load()).find((e) => e.id === id);
      if (!entry) return null;
      const model = entry.dimension === '3D',
        folder = join(dir, 'stock', 'pieces'),
        path = join(folder, `${encodeURIComponent(entry.id)}.${model ? 'glb' : 'svg'}`);
      const cached = await readFile(path, model ? undefined : 'utf8').catch(() => null);
      if (cached) return cached;
      let bytes;
      try {
        bytes = Buffer.from(await downloadPiece(entry.catalog.piece(entry.catalog, entry)));
      } catch (error) {
        throw new Error(`Stock piece ${id} download failed: ${error.message}`);
      }
      const data = model ? bytes : bytes.toString('utf8');
      if (
        model
          ? bytes.toString('latin1', 0, 4) !== 'glTF'
          : !/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/.test(data)
      )
        throw new Error(`Stock piece ${id} download is not ${model ? 'a GLB' : 'an SVG'} file`);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await writeAtomic(path, data);
      return data;
    },
  };
}
