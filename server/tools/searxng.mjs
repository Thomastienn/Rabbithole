// Only Settings chooses the search server; model arguments can supply a query, never a URL.
export function searxngUrl(value) {
    if (value === null || value === '') return null;
    try {
        const url = new URL(value);
        if (
            typeof value !== 'string' ||
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash
        )
            throw new Error();
        return url.href.replace(/\/$/, '');
    } catch {
        throw new Error(
            'Enter a SearXNG HTTP(S) instance URL without credentials, query or fragment.',
        );
    }
}

const httpUrl = (value) => {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
            ? url.href
            : null;
    } catch {
        return null;
    }
};

// category: 'images' (image rows), 'videos' (video pages as plain rows) or none.
async function search(url, query, category, signal) {
    const images = category === 'images';
    if (typeof query !== 'string' || !query.trim() || query.length > 2000)
        throw new Error('Search needs a nonempty query of up to 2000 characters.');
    if (!url) throw new Error('SearXNG is unavailable. Check Search in Settings.');
    const target = new URL(`${url}/search`);
    target.search = new URLSearchParams({
        q: query.trim(),
        format: 'json',
        ...(category && { categories: category }),
    });
    const timed = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
    try {
        const response = await fetch(target, {
            signal: timed,
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(
                response.status === 403
                    ? 'SearXNG refused JSON search (HTTP 403). Enable json in search.formats in its settings.yml; also check access restrictions.'
                    : `SearXNG returned HTTP ${response.status}. Check the instance URL and access restrictions.`,
            );
        }
        let bytes = 0;
        const chunks = [];
        for await (const chunk of response.body) {
            bytes += chunk.length;
            if (bytes > 5 * 1024 * 1024) throw new Error('SearXNG response exceeded 5 MiB.');
            chunks.push(chunk);
        }
        let data;
        try {
            data = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
            throw new Error(
                'SearXNG did not return JSON. Enable json in search.formats in its settings.yml.',
            );
        }
        if (!Array.isArray(data?.results))
            throw new Error(
                'SearXNG JSON has no results list. Check that the URL points to a SearXNG instance.',
            );
        return data.results
            .flatMap((row) => {
                if (!row || typeof row !== 'object') return [];
                const page = httpUrl(row.url),
                    image = httpUrl(row.img_src);
                if (!page || (images && !image)) return [];
                const title = typeof row.title === 'string' ? row.title.slice(0, 1000) : '';
                return [
                    images
                        ? {
                              imageUrl: image,
                              thumbnail: httpUrl(row.thumbnail_src),
                              title,
                              sourceUrl: page,
                          }
                        : {
                              title,
                              url: page,
                              snippet:
                                  typeof row.content === 'string' ? row.content.slice(0, 4000) : '',
                          },
                ];
            })
            .slice(0, 10);
    } catch (error) {
        signal?.throwIfAborted();
        if (timed.aborted)
            throw new Error(
                'SearXNG search timed out after 30 seconds. Check the instance and retry.',
            );
        if (error instanceof TypeError)
            throw new Error(
                `Cannot reach SearXNG (${error.cause?.code ?? 'network error'}). Check the URL and that the instance is running.`,
            );
        throw error;
    }
}

export function searxngSearch({ store, managed }) {
    const config = () => {
        const own = managed(),
            customUrl = store.searxngUrl();
        return { ...own, url: customUrl ?? own.url, customUrl, managedUrl: own.url };
    };
    let probed = null;
    return {
        // Deciding which tools to offer makes no outside request: the managed instance knows its own
        // state, and a typed address reuses its last probe for a minute. Settings calls status().
        async ready({ signal } = {}) {
            const state = config();
            if (!state.customUrl) return state.ready;
            if (probed?.url !== state.url || Date.now() - probed.at > 60000)
                probed = {
                    url: state.url,
                    ready: (await this.status({ signal })).ready,
                    at: Date.now(),
                };
            return probed.ready;
        },
        async status({ url, signal } = {}) {
            const state = config();
            if (url !== undefined) state.url = searxngUrl(url) ?? state.managedUrl;
            if (!state.url) return { ...state, ready: false };
            try {
                const results = await search(state.url, 'Rabbithole', false, signal);
                return { ...state, ready: true, error: null, results: results.length };
            } catch (error) {
                signal?.throwIfAborted();
                return { ...state, ready: false, error: error.message };
            }
        },
        save(value) {
            const url = searxngUrl(value);
            store.saveSearxngUrl(url === managed().url ? null : url);
        },
        async run(input, { signal }, category) {
            return JSON.stringify({
                results: await search(config().url, input.query, category, signal),
            });
        },
    };
}
