import { readFileSync, writeFileSync } from 'node:fs';

// Add-ons group the tools (ADR 0020). Sizes are approximate downloads of the pinned tools.
const ADDONS = [
    {
        id: 'video-tools',
        name: 'Video tools',
        enables: 'Let the tutor make short narrated videos, with animation and equations.',
        size: 500e6,
        dependency: 'offline-python',
        tools: ['uv', 'latex', 'manim', 'browser'],
    },
    {
        id: 'offline-python',
        name: 'Offline Python',
        enables:
            'Lets the tutor run Python on this computer to calculate, check its work and draw charts. Videos use it too.',
        size: 50e6,
        dependency: null,
        // Its setup makes the venv with uv, so uv comes first; video tools share it.
        tools: ['uv', 'python'],
    },
    {
        id: 'web-search',
        name: 'Web search',
        enables:
            'Lets custom endpoint models search the web. With any model, finds images and real photos for visuals and videos. Claude and Codex search the web with their own tools.',
        size: 40e6,
        dependency: null,
        tools: ['searxng'],
    },
];

const remembered = (file) => {
    try {
        const ids = JSON.parse(readFileSync(file, 'utf8'));
        return Array.isArray(ids) ? ids : [];
    } catch {
        return [];
    }
};

// Tool downloads run one at a time. State lives only in memory, so a tool that is not ready queues again on the next launch.
// tools: [{ id, name, requested?: () => boolean, ready: () => Promise<boolean>, run: ({ report, signal }) => Promise<void> }]
// file: where the data folder remembers which add-ons the learner installed.
export function downloadManager(tools, { file = null } = {}) {
    const items = new Map(),
        listeners = new Set(),
        controller = new AbortController(),
        installed = new Set(file ? remembered(file) : []),
        // Add-ons installed before this launch: what they download again is an update.
        previous = new Set(installed),
        found = new Set();
    let chain = Promise.resolve(),
        queuing = Promise.resolve(),
        started;
    const view = (item) => ({
        id: item.id,
        name: item.name,
        state: item.state,
        bytes: item.bytes,
        total: item.total,
        percent: item.percent,
        ...(item.update && { update: true }),
        ...(item.error && { error: item.error }),
    });
    // A ready download stays listed until the learner has opened the list once.
    const list = () => [...items.values()].filter((i) => !i.seen).map(view);
    const changed = () => {
        const current = list();
        for (const listener of listeners) listener(current);
    };
    const run = async (item) => {
        if (controller.signal.aborted) return;
        Object.assign(item, { state: 'running', bytes: null, total: null, percent: null });
        changed();
        const report = ({ bytes = null, total = null, percent = null }) => {
            // Only a whole-percent change is streamed, so chunked downloads do not flood the client.
            const rounded = percent === null ? null : Math.round(percent);
            if (item.state !== 'running' || (rounded === item.percent && total === item.total))
                return;
            Object.assign(item, { bytes, total, percent: rounded });
            changed();
        };
        try {
            await item.tool.run({ report, signal: controller.signal });
            Object.assign(item, { state: 'ready', percent: 100, error: undefined });
        } catch (error) {
            if (controller.signal.aborted) return;
            Object.assign(item, { state: 'failed', error: error.message || 'Download failed.' });
        }
        changed();
    };
    const enqueue = (item) => {
        Object.assign(item, { state: 'queued', percent: null, error: undefined, seen: false });
        items.set(item.id, item);
        chain = chain.then(() => run(item));
        changed();
    };
    const byId = (id) => ADDONS.find((a) => a.id === id);
    const toolsOf = (addon) =>
        addon.tools.map((id) => tools.find((t) => t.id === id)).filter(Boolean);
    const ready = (tool) => tool.ready().catch(() => false);
    // Queues the add-on's dependency first, then each of its tools a check finds not ready; tools found ready never list.
    const queueNow = async (addon, update = false) => {
        if (addon.dependency) await queueNow(byId(addon.dependency), update);
        for (const tool of toolsOf(addon)) {
            const item = items.get(tool.id);
            if (item && item.state !== 'failed') continue;
            const isReady = await ready(tool);
            if (controller.signal.aborted) return;
            if (isReady) found.add(tool.id);
            else enqueue(item ?? { id: tool.id, name: tool.name, tool, update });
        }
    };
    // One at a time: a second install must see what the first one listed.
    const queue = (addon, update) => (queuing = queuing.then(() => queueNow(addon, update)));
    const remember = (addon) => {
        if (addon.dependency) remember(byId(addon.dependency));
        if (installed.has(addon.id)) return;
        installed.add(addon.id);
        if (file) writeFileSync(file, JSON.stringify([...installed]));
    };
    // A web search folder from before add-ons still counts as asked for.
    const requested = (addon) =>
        installed.has(addon.id) || toolsOf(addon).some((t) => t.requested?.());
    const addonView = (addon) => {
        const parts = toolsOf(addon).map((t) =>
            found.has(t.id) ? { state: 'ready' } : (items.get(t.id) ?? { state: 'missing' }),
        );
        const failed = parts.find((p) => p.state === 'failed');
        const active = parts.filter((p) => p.state === 'queued' || p.state === 'running');
        const state = failed
            ? 'failed'
            : active.length
              ? active.some((p) => p.update)
                  ? 'updating'
                  : 'downloading'
              : parts.every((p) => p.state === 'ready')
                ? 'installed'
                : 'not-installed';
        const percent =
            active.length && !failed
                ? Math.round(
                      parts.reduce(
                          (sum, p) => sum + (p.state === 'ready' ? 100 : (p.percent ?? 0)),
                          0,
                      ) / parts.length,
                  )
                : null;
        const { id, name, enables, size, dependency } = addon;
        return {
            id,
            name,
            enables,
            size,
            dependency,
            state,
            percent,
            ...(failed && { error: failed.error }),
        };
    };
    // Runs a tool at once, beside the add-on queue, as a listed download; asking while it runs joins it.
    const now = (tool) => {
        const item = items.get(tool.id) ?? { id: tool.id, name: tool.name, tool, now: true };
        if (item.state === 'running') return item.done;
        item.seen = false;
        items.set(item.id, item);
        return (item.done = run(item));
    };
    return {
        list,
        addons: () => ADDONS.map(addonView),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        // Called once first-run setup has ended: only add-ons the learner installed are checked and queued for update.
        start() {
            return (started ??= (async () => {
                for (const addon of ADDONS) {
                    if (requested(addon)) await queue(addon, previous.has(addon.id));
                    // A quiet look that never queues, so tools already in the tool root count as installed.
                    else if (!toolsOf(addon).some((t) => t.requested))
                        for (const tool of toolsOf(addon))
                            if (await ready(tool)) found.add(tool.id);
                    if (controller.signal.aborted) return;
                }
                // Tools found ready here may free a video waiting for them.
                changed();
                await chain;
            })());
        },
        // Installs an add-on, or retries its failed tools; false for an unknown id.
        async install(id) {
            const addon = byId(id);
            if (!addon) return false;
            remember(addon);
            await queue(addon);
            return true;
        },
        now,
        retry(id) {
            const item = items.get(id);
            if (item?.state !== 'failed') return false;
            if (item.now) void now(item.tool);
            else enqueue(item);
            return true;
        },
        seen() {
            let any = false;
            for (const item of items.values())
                if (item.state === 'ready' && !item.seen) any = item.seen = true;
            if (any) changed();
        },
        // The unavailable reason for a video while one of its tools is not ready, else null.
        videoWaiting() {
            const video = byId('video-tools'),
                { state, size, percent } = addonView(video);
            if (state === 'installed') return null;
            if (state === 'not-installed' && !requested(video))
                return `Video tools aren't installed (about ${Math.round(size / 1e6)} MB).`;
            return `Video tools are still downloading (${percent ?? 0}%).`;
        },
        idle: () => chain,
        stop: () => controller.abort(),
    };
}
