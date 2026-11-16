import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The 2D catalog: Fluent Emoji, flat style only. The repository has no catalog file, so the index is
// built from its git tree listing at this pinned commit. The hash covers the built index, because the
// listing's JSON formatting is GitHub's and not pinned, while the commit's paths are.
export const FLUENT = {
  repo: 'microsoft/fluentui-emoji',
  revision: '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc',
  hash: 'ef985b7627ac3f1ba05a2824c34875c72cc5935246195763ec19939ff7562993',
};
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
  const path = join(dir, 'stock', `fluent-emoji-${catalog.revision}.json`);
  const cached = await readFile(path, 'utf8').catch(() => null);
  if (cached && sha256(cached) === catalog.hash) return JSON.parse(cached);
  let text;
  try {
    text = JSON.stringify(
      fluentIndex(
        await download(
          `https://api.github.com/repos/${catalog.repo}/git/trees/${catalog.revision}?recursive=1`,
        ),
      ),
    );
  } catch (error) {
    throw new Error(`Stock catalog download failed (Fluent Emoji): ${error.message}`);
  }
  if (sha256(text) !== catalog.hash)
    throw new Error('Stock catalog index (Fluent Emoji) does not match its recorded hash.');
  await mkdir(join(dir, 'stock'), { recursive: true, mode: 0o700 });
  const part = `${path}.part-${randomUUID()}`;
  await writeFile(part, text);
  await rename(part, path).catch((error) =>
    rm(part, { force: true }).then(() => Promise.reject(error)),
  );
  return JSON.parse(text);
}

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
    .map(({ entry: { id, title, type } }) => ({ id, title, type }));
}

// Object names in, top 3 pieces per name out. The index loads on first use; a failure is retried next call.
export function stockCatalog(dir, download) {
  let loading;
  return {
    async match(names) {
      loading ??= stockIndex(dir, download).catch((error) => {
        loading = undefined;
        throw error;
      });
      const index = await loading;
      return names.map((object) => ({ object, pieces: keywordMatch(index, object) }));
    },
  };
}
