import { EventEmitter } from 'node:events';

const changes = new EventEmitter();
export const notify = () => changes.emit('change');
const observed = new WeakMap();

// Observe existing fixture calls and Store writes; waiters sleep on events, never poll a clock.
export function observe(object, methods) {
  if (!object) return object;
  const seen = observed.get(object) ?? new Set();
  observed.set(object, seen);
  for (const name of methods) {
    if (seen.has(name) || typeof object[name] !== 'function') continue;
    seen.add(name);
    const original = object[name];
    object[name] = function (...args) {
      try {
        const value = original.apply(this, args);
        if (value?.then) value.then(notify, notify);
        return value;
      } finally {
        notify();
      }
    };
  }
  return object;
}

export const observeStore = (store) =>
  observe(store, [
    'pendingArtifact',
    'finishArtifact',
    'finishVideo',
    'cancelVideo',
    'cancelVisuals',
    'finishSuggestions',
    'record',
    'update',
    'compacted',
    'thread',
  ]);
export const observeProvider = (provider) =>
  observe(provider, ['generate', 'model', 'models', 'rpc']);

export async function until(check) {
  const timeout = AbortSignal.timeout(5000);
  for (;;) {
    const next = Promise.withResolvers();
    const changed = () => next.resolve();
    const aborted = () => next.reject(new Error('condition timed out'));
    changes.once('change', changed);
    timeout.addEventListener('abort', aborted, { once: true });
    try {
      const value = await check();
      if (value) return value;
      timeout.throwIfAborted();
      await next.promise;
    } finally {
      changes.removeListener('change', changed);
      timeout.removeEventListener('abort', aborted);
    }
  }
}
