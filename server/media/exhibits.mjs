// The exhibit fetcher: turns a planned exhibit into data for its cut (ADR 0005). Images are downloaded on the
// server through the public-address checks read_page uses, so cut code and its sandbox stay offline.
import { lookup as dnsLookup } from 'node:dns';
import { mkdir, writeFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { request, body, publicAddress, site } from '../tools/readPage.mjs';
import { downloadClip } from './clips.mjs';
import { pieceNames } from './video-plan.mjs';
import { cutWork } from './video-workspace.mjs';

const MAX_IMAGE = 3 * 1024 * 1024,
    TRIES = 3;

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
    const timed = AbortSignal.any([AbortSignal.timeout(60000), ...(signal ? [signal] : [])]);
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

// The downloader fetches whatever a page links to, so at least the page's own host must be public.
async function publicHost(url, lookup, isPublic) {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    const addresses = await new Promise((resolve, reject) =>
        lookup(host, { all: true }, (error, all) => (error ? reject(error) : resolve(all))),
    );
    if (!addresses.length || !addresses.every((a) => isPublic(a.address)))
        throw new Error(`refused non-public clip host ${host}`);
}

// One planned exhibit to {kind, url, title, site, text?, by?, bytes?, type?, seconds?, sound?, sentence?}; any failure throws, and
// the caller drops the exhibit. search is the SearXNG tool (run(input, options, category)); clips is the
// detected downloader and clip the function that downloads and trims (a fake in tests).
export async function fetchExhibit(
    planned,
    {
        search,
        signal,
        clips,
        tmp,
        clip = downloadClip,
        lookup = dnsLookup,
        isPublic = publicAddress,
    },
) {
    const category = { image: 'images', clip: 'videos' }[planned.kind];
    const { results } = JSON.parse(
        await search.run({ query: planned.query }, { signal }, category),
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
    if (planned.kind === 'clip') {
        if (!clips?.ready) throw new Error(clips?.error ?? 'clip downloader unavailable');
        for (const r of results.slice(0, TRIES))
            try {
                await publicHost(r.url, lookup, isPublic);
                const { start, end, sound } = planned;
                return {
                    kind: 'clip',
                    url: r.url,
                    title: r.title,
                    site: site(r.url),
                    seconds: end - start,
                    ...(sound && { sound, sentence: planned.sentence }),
                    bytes: await clip(
                        { url: r.url, start, end, ...(sound && { sound }) },
                        { clips, signal, tmp },
                    ),
                    type: 'video/mp4',
                };
            } catch (error) {
                signal?.throwIfAborted();
                last = error;
            }
        throw last;
    }
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

// Fetches every planned exhibit; a failed one is dropped with a warning and its cut is written without it.
// Image and clip bytes are saved in their cut folder, where staging inlines them into the cut's host data.
export async function fetchExhibits(
    plan,
    { fetch, workspace, signal, wait, onWarning, onExhibit },
) {
    const planned = plan.cuts.flatMap((c, cut) => (c.exhibits ?? []).map((e) => ({ ...e, cut })));
    const fetched = await wait(
        Promise.all(
            planned.map((p) =>
                fetch(p).catch((error) => {
                    signal.throwIfAborted();
                    onWarning(`WARN video exhibit dropped: ${error.message}`);
                    return null;
                }),
            ),
        ),
    );
    const exhibits = [];
    for (const [n, e] of fetched.entries()) {
        if (!e) continue;
        const { bytes, ...meta } = e,
            { cut, show } = planned[n],
            id = `exhibit${n + 1}`;
        const file = bytes && `exhibits/${id}`;
        if (bytes) {
            await mkdir(join(cutWork(workspace, cut), 'exhibits'), {
                recursive: true,
                mode: 0o700,
            });
            await writeFile(join(cutWork(workspace, cut), file), bytes);
        }
        exhibits.push({ id, cut, ...meta, ...(show && { show }), ...(file && { file }) });
        onExhibit(exhibits.at(-1));
    }
    return exhibits;
}

// One photo per set piece whose object carries a reference query, fetched once per distinct query before set pieces
// are drawn; a failed or empty search leaves that piece without one. Files sit in the attempt's references folder,
// never in a cut folder, so no cut can show them. pictures: some cut's engine draws set pieces.
export async function fetchReferences(
    plan,
    { fetch, workspace, signal, wait, onWarning, onReference, pictures },
) {
    if (!pictures) return [];
    const names = pieceNames(plan),
        objects = plan.styleBrief.recurringObjects.filter((o) => o.look);
    const queries = [...new Set(objects.map((o) => o.referenceQuery).filter(Boolean))];
    const fetched = await wait(
        Promise.all(
            queries.map((query) =>
                fetch({ kind: 'image', query }).catch((error) => {
                    signal.throwIfAborted();
                    onWarning(`WARN video reference photo skipped: ${error.message}`);
                    return null;
                }),
            ),
        ),
    );
    const references = [];
    for (const [n, photo] of fetched.entries()) {
        if (!photo) continue;
        const { bytes, type, url, title, site } = photo,
            file = `references/reference${n + 1}`;
        await mkdir(join(workspace, 'references'), { recursive: true, mode: 0o700 });
        await writeFile(join(workspace, file), bytes);
        onReference({ url, title, site });
        for (const [i, o] of objects.entries())
            if (o.referenceQuery === queries[n])
                references.push({ name: names[i], file, type, url, title, site });
    }
    return references;
}

// A new plan's exhibits and reference photos, each credited as a resource of the learning tree; fetch is the
// exhibit fetcher. Retry keeps the first attempt's: exhibit files came along with the cut folders, and the
// reference folder is copied from the previous attempt's workspace (from).
export async function videoMedia({ plan, prior, from, searching, fetch, credit, ...options }) {
    if (prior?.plan)
        return {
            exhibits: prior.exhibits ?? [],
            references: prior.references?.length
                ? await cp(join(from, 'references'), join(options.workspace, 'references'), {
                      recursive: true,
                  }).then(
                      () => prior.references,
                      () => [],
                  )
                : [],
        };
    const exhibits = await fetchExhibits(plan, {
        fetch,
        ...options,
        onExhibit: (e) => credit({ url: e.url, title: e.title, site: e.site, kind: e.kind }),
    });
    const references = searching
        ? await fetchReferences(plan, {
              fetch,
              ...options,
              onReference: (r) => credit({ ...r, kind: 'image' }),
          })
        : [];
    return { exhibits, references };
}
