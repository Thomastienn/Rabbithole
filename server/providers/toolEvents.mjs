// Native web tools run inside the CLI; app tools report directly from the MCP runner.
export function toolEvents(emit) {
  const pending = new Map();
  const event = (tool, status, output = null) =>
    emit({
      type: 'tool',
      tool: {
        id: tool.id,
        name: tool.name,
        input: tool.input,
        status,
        output,
        elapsed: Math.round(performance.now() - tool.started),
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
    finish(id, output, failed = false) {
      const tool = pending.get(id);
      if (!tool) return;
      clearInterval(tool.timer);
      event(tool, failed ? 'failed' : 'done', output);
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
