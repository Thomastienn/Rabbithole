import { useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Table, proportional } from '@astryxdesign/core/Table';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Banner } from '@astryxdesign/core/Banner';
import { breakdown, buckets, label, span, total, totals, type Totals, type UsageEvent, type UsageRange } from './usage';

const SERIES = [['input', 'Input'], ['output', 'Output'], ['cacheRead', 'Cache read']] as const;
const TASKS: Record<string, string> = { chat: 'Chat replies', suggestions: 'Suggestions', compaction: 'Context preparation', diagram: 'Visuals and diagrams', video: 'Videos' };
const n = (v: number) => v.toLocaleString();
const counts = (t: Totals) => `${n(t.input)} input, ${n(t.output)} output, ${n(t.cacheRead)} cache-read tokens (${n(total(t))} total)`;
const calls = (t: Totals) => `${n(t.calls)} measured call${t.calls === 1 ? '' : 's'}${t.unavailable ? `, ${n(t.unavailable)} without reported counts` : ''}`;
// A group with only unreported calls shows a dash, not zero tokens.
const cell = (r: any, key: string) => r.calls === 0 && r.unavailable ? '—' : n(r[key]);
const columns = (first: string) => [{ key: 'name', header: first, width: proportional(2) }, ...['input', 'output', 'cacheRead', 'total'].map(key => ({ key, header: SERIES.find(([k]) => k === key)?.[1] ?? 'Total', align: 'end' as const, renderCell: (r: any) => cell(r, key) })),
  ...([['calls', 'Calls'], ['unavailable', 'Unreported']] as const).map(([key, header]) => ({ key, header, align: 'end' as const, renderCell: (r: any) => n(r[key]) }))];

// Reads saved usage records only; viewing never calls a model.
export default function UsageDashboard({ api }: { api: (path: string) => Promise<any> }) {
  const now = new Date();
  const [range, setRange] = useState<UsageRange>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [cumulative, setCumulative] = useState(false);
  const [data, setData] = useState<{ first: number | null; events: UsageEvent[] } | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const chart = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let current = true;
    const s = span(range, new Date(), year, null);
    api(range === 'all' ? '/api/usage' : `/api/usage?from=${+s.from}&to=${+s.to}`).then(d => { if (current) { setData(d); setError(''); setActive(-1); } }, e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [range, year]);

  const s = span(range, now, year, data?.first ?? null), unit = s.unit;
  const events = data?.events ?? [], rows = buckets(events, s, cumulative), sum = totals(events);
  const max = Math.max(1, ...rows.map(total)), shown = rows[active];
  const years = Array.from({ length: now.getFullYear() - new Date(data?.first ?? now).getFullYear() + 1 }, (_, i) => String(now.getFullYear() - i));
  const move = (i: number) => { const next = Math.max(0, Math.min(rows.length - 1, i)); setActive(next); chart.current?.querySelectorAll<SVGGElement>('.usage-bar')[next]?.focus(); };
  const periodLabel = (i: number) => label(rows[i].start, unit) + (cumulative ? ' (cumulative)' : '');

  return <VStack gap={5}>
    <HStack gap={3} wrap="wrap" vAlign="end">
      <SegmentedControl label="Usage range" value={range} onChange={v => setRange(v as UsageRange)}>
        <SegmentedControlItem value="today" label="Today" />
        <SegmentedControlItem value="week" label="Week" />
        <SegmentedControlItem value="month" label="Month" />
        <SegmentedControlItem value="year" label="Year" />
        <SegmentedControlItem value="all" label="All time" />
      </SegmentedControl>
      {range === 'year' && <Selector label="Year" isLabelHidden options={years} value={String(year)} onChange={v => setYear(Number(v))} width="7rem" />}
      <SegmentedControl label="Chart view" value={cumulative ? 'cumulative' : 'trend'} onChange={v => setCumulative(v === 'cumulative')}>
        <SegmentedControlItem value="trend" label="Per period" />
        <SegmentedControlItem value="cumulative" label="Cumulative" />
      </SegmentedControl>
    </HStack>
    {error && <Banner status="error" title="Usage history could not load" description={error} />}
    {data && <>
      {events.length > 0 && <VStack gap={1}>
        <Text className="usage-total">{counts(sum)}</Text>
        <Text type="supporting" color="secondary">{calls(sum)}. Counts are what providers reported; calls without reported counts are shown, never estimated.</Text>
      </VStack>}
      {events.length === 0
        ? <Text color="secondary" className="usage-empty">No usage recorded in this range. Replies and suggestions add to this history as providers report their tokens.</Text>
        : <VStack gap={2}>
          <HStack gap={4} wrap="wrap" className="usage-legend" aria-hidden>{SERIES.map(([key, name]) => <HStack key={key} gap={1} vAlign="center"><span className="usage-swatch" data-series={key} /><Text type="supporting">{name}</Text></HStack>)}</HStack>
          <div className="usage-chart">
            <Text type="supporting" color="secondary" className="usage-max" aria-hidden>{n(max)}</Text>
            <svg ref={chart} viewBox={`0 0 ${rows.length * 10} 100`} preserveAspectRatio="none" role="group" aria-label={`${cumulative ? 'Cumulative' : 'Per-period'} token usage by ${unit}. Use arrow keys to read each ${unit}.`} onMouseLeave={() => setActive(-1)}>
              {rows.map((r, i) => {
                let y = 100;
                return <g key={+r.start} className="usage-bar" data-active={i === active} tabIndex={i === Math.max(active, 0) ? 0 : -1} role="img" aria-label={`${periodLabel(i)}: ${counts(r)}; ${calls(r)}`}
                  onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}
                  onKeyDown={e => { const to = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: rows.length - 1 }[e.key]; if (to !== undefined) { e.preventDefault(); move(to); } }}>
                  <rect className="usage-hit" x={i * 10} y={0} width={10} height={100} />
                  {SERIES.map(([key]) => { const h = r[key] / max * 96; y -= h; return h > 0 && <rect key={key} data-series={key} x={i * 10 + 1.5} y={y} width={7} height={h} />; })}
                </g>;
              })}
            </svg>
            <HStack hAlign="between" className="usage-axis" aria-hidden><Text type="supporting" color="secondary">{label(rows[0].start, unit)}</Text><Text type="supporting" color="secondary">{label(rows.at(-1)!.start, unit)}</Text></HStack>
          </div>
          <Text type="supporting" aria-live="polite" className="usage-readout">{shown ? `${periodLabel(active)}: ${counts(shown)}; ${calls(shown)}` : 'Hover or focus a bar for its exact values.'}</Text>
          <Collapsible defaultIsOpen={false} trigger={<Text>Values for each {unit}</Text>}>
            <Table density="compact" data={rows.map((r, i) => ({ id: +r.start, name: periodLabel(i), ...r, total: total(r) }))} idKey="id" columns={columns(unit[0].toUpperCase() + unit.slice(1))} />
          </Collapsible>
        </VStack>}
      {events.length > 0 && <>
        <VStack gap={2}><Heading level={4}>By model</Heading>
          <Table density="compact" data={breakdown(events, e => e.model ? `${e.model} (${e.provider})` : e.provider ? `${e.provider}, model not reported` : 'Unknown model (saved before attribution)')} idKey="name" columns={columns('Model')} /></VStack>
        <VStack gap={2}><Heading level={4}>By task</Heading>
          <Table density="compact" data={breakdown(events, e => TASKS[e.task] ?? e.task)} idKey="name" columns={columns('Task')} /></VStack>
      </>}
    </>}
  </VStack>;
}
