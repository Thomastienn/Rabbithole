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
