import { randomUUID } from 'node:crypto';
import { EndpointError } from './endpointSettings.mjs';

// Reads server-sent events, passing each event's joined data lines to frame until it returns true.
export async function streamEvents(body, frame) {
  let buffer = '';
  for await (const part of body.pipeThrough(new TextDecoderStream())) {
    buffer += part;
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const event = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const data = event
        .split(/\r?\n/)
        .filter((line) => line === 'data' || line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''));
      if (data.length && frame(data.join('\n'))) return;
    }
    if (buffer.length > 1024 * 1024)
      throw new EndpointError(
        'Custom endpoint returned an oversized stream event. Try another model.',
      );
  }
}

// Saved completed turns; with tools offered, earlier tool calls replay with their saved outputs so the model never re-runs them.
export const history = (messages, replayTools) =>
  messages
    .filter((m) => m.status === 'completed')
    .flatMap((m) => [
      ...(replayTools && m.tools?.length
        ? [
            {
              role: 'assistant',
              content: null,
              tool_calls: m.tools.map((t) => ({
                id: t.id,
                type: 'function',
                function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
              })),
            },
            ...m.tools.map((t) => ({ role: 'tool', tool_call_id: t.id, content: t.output ?? '' })),
          ]
        : []),
      { role: m.role, content: m.text },
    ]);

// One call's reported usage in Rabbithole's counts (cache reads apart from input), or null.
export function chunkUsage(u) {
  if (![u?.prompt_tokens, u?.completion_tokens].every((n) => Number.isSafeInteger(n) && n >= 0))
    return null;
  const cached = u.prompt_tokens_details?.cached_tokens;
  const cacheRead =
    Number.isSafeInteger(cached) && cached >= 0 ? Math.min(cached, u.prompt_tokens) : 0;
  return { input: u.prompt_tokens - cacheRead, output: u.completion_tokens, cacheRead };
}

// Runs one model tool call through the turn's runner and emits its tool events; a failure goes back to the model as text.
export async function runTool(tree, call, emit, signal, key) {
  const id = randomUUID(),
    started = performance.now();
  const redact = (text) =>
    String(text)
      .replaceAll(key, '[redacted]')
      .replaceAll(JSON.stringify(key).slice(1, -1), '[redacted]');
  const name = redact(call.name);
  let credentials = name !== call.name;
  const clean = (value) => {
    if (typeof value === 'string') {
      const safe = redact(value);
      credentials ||= safe !== value;
      return safe;
    }
    if (Array.isArray(value)) return value.map(clean);
    return value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [clean(k), clean(v)]))
      : value;
  };
  let input;
  try {
    input = clean(JSON.parse(call.arguments || '{}'));
  } catch {
    input = clean(call.arguments);
  }
  const event = (status, output) =>
    emit({
      type: 'tool',
      tool: {
        id,
        name,
        input,
        status,
        output,
        elapsed: Math.round(performance.now() - started),
      },
    });
  event('running', null);
  const timer = setInterval(() => event('running', null), 1000);
  try {
    signal.throwIfAborted();
    if (credentials) throw new Error('Tool call contained endpoint credentials; it was refused.');
    if (!tree.tools.some((tool) => tool.name === name))
      throw new Error(`Tool ${name} is not available for this turn.`);
    const output = redact(await tree.runTool(name, input, signal));
    event('done', output);
    return output;
  } catch (error) {
    if (signal.aborted) throw error;
    const output = `Error: ${redact(error.message)}`;
    event('failed', output);
    return output;
  } finally {
    clearInterval(timer);
  }
}
