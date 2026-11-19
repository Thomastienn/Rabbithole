import { MAX_SOURCE } from './video-plan.mjs';
import { providerError } from '../log.mjs';

// cut: the 1-based cut a call serves, passed past the provider's signal for the usage meter only.
export async function videoCall(
  provider,
  selection,
  instructions,
  input,
  signal,
  onText,
  images,
  cut,
  // { tools, mcp, runTool } for a call that reports through tool calls.
  tools,
) {
  const items = new Map();
  let status, overflow;
  try {
    await provider.generate(
      { ...selection, thread: null, instructions, ...(images && { images }), ...tools },
      input,
      (event) => {
        if (signal.aborted) return;
        if ((event.type === 'delta' || event.type === 'item') && !overflow) {
          items.set(
            event.item,
            event.type === 'item' ? event.text : (items.get(event.item) ?? '') + event.text,
          );
          const bytes = [...items.values()].reduce((n, v) => n + Buffer.byteLength(v), 0);
          if (items.size > 32 || bytes > MAX_SOURCE) {
            overflow = true;
            items.clear();
          } else onText?.(bytes, [...items.values()].join('\n\n'));
        }
        if (event.type === 'status') status = event.status;
      },
      () => {},
      signal,
      cut,
    );
  } catch (error) {
    signal.throwIfAborted();
    throw new Error(`Video provider failed: ${providerError(error)}`);
  }
  signal.throwIfAborted();
  if (status !== 'completed') throw new Error('Video composition did not complete.');
  if (overflow)
    throw Object.assign(new Error('Video composition exceeds 64 KiB.'), { invalidOutput: true });
  return [...items.values()].join('\n\n');
}
