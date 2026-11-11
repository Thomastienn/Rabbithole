// Durable usage history: local-calendar ranges and buckets for the Settings dashboard.
export type UsageEvent = { at: number; provider: string | null; model: string | null; task: string; input: number | null; output: number | null; cacheRead: number | null };
export type UsageRange = 'today' | 'week' | 'month' | 'year' | 'all';
export type Unit = 'hour' | 'day' | 'month' | 'year';
export type Span = { from: Date; to: Date; unit: Unit };
export type Totals = { input: number; output: number; cacheRead: number; calls: number; unavailable: number };
export type Bucket = Totals & { start: Date; end: Date };

// Local date arithmetic keeps day/month boundaries right across DST and year ends.
export const step = (d: Date, unit: Unit, n = 1) =>
  unit === 'hour' ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + n)
    : unit === 'day' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
      : unit === 'month' ? new Date(d.getFullYear(), d.getMonth() + n, 1)
        : new Date(d.getFullYear() + n, 0, 1);

export function span(range: UsageRange, now: Date, year: number, first: number | null): Span {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'today') return { from: today, to: step(today, 'day'), unit: 'hour' };
  if (range === 'week') { const from = step(today, 'day', -((today.getDay() + 6) % 7)); return { from, to: step(from, 'day', 7), unit: 'day' }; } // Monday-start week
  if (range === 'month') { const from = new Date(now.getFullYear(), now.getMonth(), 1); return { from, to: step(from, 'month'), unit: 'day' }; }
  if (range === 'year') return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1), unit: 'month' };
  const start = new Date(first ?? now.getTime()), to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const months = (to.getFullYear() - start.getFullYear()) * 12 + to.getMonth() - start.getMonth();
  return months > 24 ? { from: new Date(start.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1), unit: 'year' } : { from: new Date(start.getFullYear(), start.getMonth(), 1), to, unit: 'month' };
}

const empty = (): Totals => ({ input: 0, output: 0, cacheRead: 0, calls: 0, unavailable: 0 });
const add = (t: Totals, e: UsageEvent) => {
  if (e.input === null) { t.unavailable++; return; }
  t.input += e.input; t.output += e.output!; t.cacheRead += e.cacheRead!; t.calls++;
};
// Providers report disjoint input, output and cache-read counts, so their sum is the total.
export const total = (t: Totals) => t.input + t.output + t.cacheRead;

export function buckets(events: UsageEvent[], { from, to, unit }: Span, cumulative = false): Bucket[] {
  const rows: Bucket[] = [];
  for (let start = from; start < to; start = step(start, unit)) rows.push({ start, end: step(start, unit), ...empty() });
  for (const e of events) { const row = rows.find(r => e.at >= +r.start && e.at < +r.end); if (row) add(row, e); }
  if (cumulative) rows.forEach((r, i) => { if (i) for (const k of ['input', 'output', 'cacheRead', 'calls', 'unavailable'] as const) r[k] += rows[i - 1][k]; });
  return rows;
}

export function totals(events: UsageEvent[]) { const t = empty(); events.forEach(e => add(t, e)); return t; }

export function breakdown(events: UsageEvent[], key: (e: UsageEvent) => string) {
  const groups = new Map<string, Totals>();
  for (const e of events) { const k = key(e); if (!groups.has(k)) groups.set(k, empty()); add(groups.get(k)!, e); }
  return [...groups].map(([name, t]) => ({ name, ...t, total: total(t) })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export const label = (d: Date, unit: Unit) => unit === 'hour' ? d.toLocaleTimeString(undefined, { hour: 'numeric' })
  : unit === 'day' ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : unit === 'month' ? d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : String(d.getFullYear());
