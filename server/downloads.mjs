// Tool downloads run one at a time. State lives only in memory, so a tool that is not ready queues again on the next launch.
// tools: [{ id, name, video?, requested?: () => boolean, ready: () => Promise<boolean>, run: ({ report, signal }) => Promise<void> }]
export function downloadManager(tools) {
  const items = new Map(),
    listeners = new Set(),
    controller = new AbortController();
  let chain = Promise.resolve(),
    started;
  const view = (item) => ({
    id: item.id,
    name: item.name,
    state: item.state,
    bytes: item.bytes,
    total: item.total,
    percent: item.percent,
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
      if (item.state !== 'running' || (rounded === item.percent && total === item.total)) return;
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
  return {
    list,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Called once first-run setup has ended; tools found ready are never listed.
    start() {
      return (started ??= (async () => {
        for (const tool of tools) {
          // An on-request tool is checked only once the learner has asked for it.
          if (tool.requested && !tool.requested()) continue;
          const ready = await tool.ready().catch(() => false);
          if (controller.signal.aborted) return;
          if (!ready) enqueue({ id: tool.id, name: tool.name, tool });
        }
        await chain;
      })());
    },
    // Queues an on-request tool; a no-op while it is already listed and not failed.
    add(id) {
      const tool = tools.find((t) => t.id === id);
      if (!tool) return false;
      const item = items.get(id);
      if (!item || item.state === 'failed') enqueue(item ?? { id, name: tool.name, tool });
      return true;
    },
    retry(id) {
      const item = items.get(id);
      if (item?.state !== 'failed') return false;
      enqueue(item);
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
      const needed = tools.filter((t) => t.video && items.has(t.id));
      if (needed.every((t) => items.get(t.id).state === 'ready')) return null;
      const percent = Math.round(
        needed.reduce((sum, t) => sum + (items.get(t.id).percent ?? 0), 0) / needed.length,
      );
      return `Video tools are still downloading (${percent}%).`;
    },
    idle: () => chain,
    stop: () => controller.abort(),
  };
}
