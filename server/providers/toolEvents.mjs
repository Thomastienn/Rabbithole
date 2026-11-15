// Native web tools run inside the CLI; app tools report directly from the MCP runner.
export function toolEvents(emit) {
  const pending = new Map();
  const event = (tool, status, output = null, resources) =>
    emit({
      type: 'tool',
      tool: {
        id: tool.id,
        name: tool.name,
        input: tool.input,
        status,
        output,
        elapsed: Math.round(performance.now() - tool.started),
        ...(resources?.length && { resources }),
      },
    });
  return {
    start(id, name, input) {
      const existing = pending.get(id);
      if (existing) {
        existing.input = input;
        event(existing, 'running');
        return;
      }
      const tool = { id, name, input, started: performance.now() };
      tool.timer = setInterval(() => event(tool, 'running'), 1000);
      pending.set(id, tool);
      event(tool, 'running');
    },
    // result is the provider's structured tool result; the pages it reports become resources.
    finish(id, output, failed = false, result) {
      const tool = pending.get(id);
      if (!tool) return;
      clearInterval(tool.timer);
      event(tool, failed ? 'failed' : 'done', output, failed ? [] : pageResources(result));
      pending.delete(id);
    },
    close() {
      for (const tool of pending.values()) {
        clearInterval(tool.timer);
        event(tool, 'failed', 'Tool ended before reporting a result.');
      }
      pending.clear();
    },
  };
}

// Pages a native search or fetch reports: every { url, title? } inside its structured result, deduplicated.
export function pageResources(value, found = new Map()) {
  if (Array.isArray(value)) value.forEach((v) => pageResources(v, found));
  else if (value && typeof value === 'object') {
    if (typeof value.url === 'string' && /^https?:\/\//i.test(value.url) && !found.has(value.url))
      try {
        const site = new URL(value.url).hostname.replace(/^www\./, '');
        const title = typeof value.title === 'string' ? value.title : '';
        found.set(value.url, { url: value.url, title, site, kind: 'page' });
      } catch {
        /* Not a URL. */
      }
    Object.values(value).forEach((v) => pageResources(v, found));
  }
  return [...found.values()];
}
