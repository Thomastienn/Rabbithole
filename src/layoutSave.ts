import type { Point } from './canvas';

export type Batch<L> = { layout: L; positions: Record<string, Point> };
export const LAYOUT_SAVE_MS = 60_000;

// Dirty layout per root tree, written as one batch per root at most once per minute.
export function layoutSaver<L>(
  write: (root: string, batch: Batch<L>) => Promise<unknown>,
  report: (failed: boolean) => void,
  timers: { set: (fn: () => void, ms: number) => unknown; clear: (timer: unknown) => void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (t) => clearTimeout(t as number),
  },
) {
  const dirty = new Map<string, Batch<L>>();
  const versions = new Map<string, number>();
  let timer: unknown;
  const schedule = () => {
    if (timer === undefined && dirty.size) timer = timers.set(() => void flush(), LAYOUT_SAVE_MS);
  };
  function mark(root: string, layout: L, positions: Record<string, Point> = {}) {
    dirty.set(root, { layout, positions: { ...dirty.get(root)?.positions, ...positions } });
    schedule();
  }
  async function flush() {
    if (timer !== undefined) timers.clear(timer);
    timer = undefined;
    const batches = [...dirty];
    const current = batches.map(([root]) => versions.get(root));
    dirty.clear();
    const results = await Promise.allSettled(batches.map(([root, batch]) => write(root, batch)));
    // Failed batches rejoin the queue under anything newer and wait for the next minute.
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' || versions.get(batches[i][0]) !== current[i]) return;
      const [root, batch] = batches[i],
        newer = dirty.get(root);
      dirty.set(root, {
        layout: newer?.layout ?? batch.layout,
        positions: { ...batch.positions, ...newer?.positions },
      });
    });
    if (batches.length)
      report(
        results.some(
          (r, i) => r.status === 'rejected' && versions.get(batches[i][0]) === current[i],
        ),
      );
    schedule();
  }
  function discard(root: string) {
    dirty.delete(root);
    versions.set(root, (versions.get(root) ?? 0) + 1);
    if (!dirty.size && timer !== undefined) {
      timers.clear(timer);
      timer = undefined;
    }
  }
  return {
    mark,
    flush,
    discard,
    pending: (): ReadonlyMap<string, Batch<L>> => dirty,
    dispose: () => {
      if (timer !== undefined) timers.clear(timer);
      timer = undefined;
    },
  };
}
