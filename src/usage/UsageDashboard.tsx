import { useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Table, proportional } from '@astryxdesign/core/Table';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Banner } from '@astryxdesign/core/Banner';
import {
  breakdown,
  buckets,
  label,
  span,
  total,
  totals,
  type Totals,
  type UsageEvent,
  type UsageRange,
} from './usage';

const SERIES = [
  ['input', 'Input'],
  ['output', 'Output'],
  ['cacheRead', 'Cache read'],
] as const;
const TASKS: Record<string, string> = {
  chat: 'Chat replies',
  suggestions: 'Suggestions',
  compaction: 'Context preparation',
  diagram: 'Visuals and diagrams',
  video: 'Videos',
  title: 'Conversation titles',
};
const n = (v: number) => v.toLocaleString();
const counts = (t: Totals) =>
  !t.calls && t.unavailable
    ? 'Token counts not reported'
    : `${n(t.input)} input, ${n(t.output)} output, ${n(t.cacheRead)} cache-read tokens (${n(total(t))} total)`;
const calls = (t: Totals) =>
  `${n(t.calls + t.unavailable)} call${t.calls + t.unavailable === 1 ? '' : 's'}${t.unavailable ? `, ${n(t.unavailable)} without reported counts` : ''}`;
// A group with only unreported calls shows a dash, not zero tokens.
const cell = (r: Totals, key: 'input' | 'output' | 'cacheRead' | 'total') =>
  r.calls === 0 && r.unavailable ? '—' : n(key === 'total' ? total(r) : r[key]);
type Row = ReturnType<typeof breakdown>[number];
const columns = (first: string, sum?: Totals) => [
  {
    key: 'name',
    header: first,
    width: proportional(2, { minWidth: 180 }),
    renderCell: (r: Row) => {
      const share = sum && total(sum) ? (r.total / total(sum)) * 100 : 0;
      return (
        <div className="usage-name">
          {r.name}
          {sum && (
            <span
              className="usage-share"
              role="img"
              aria-label={`${share.toLocaleString(undefined, { maximumFractionDigits: 1 })}% of reported tokens`}
            >
              <i style={{ width: `${share}%` }} />
            </span>
          )}
        </div>
      );
    },
  },
  ...(['input', 'output', 'cacheRead', 'total'] as const).map((key) => ({
    key,
    header: SERIES.find(([k]) => k === key)?.[1] ?? 'Total',
    width: proportional(1, { minWidth: key === 'cacheRead' ? 90 : 75 }),
    align: 'end' as const,
    renderCell: (r: Row) => cell(r, key),
  })),
  {
    key: 'calls',
    header: 'Calls',
    width: proportional(1, { minWidth: 90 }),
    align: 'end' as const,
    renderCell: (r: Row) => (
      <span>
        {n(r.calls + r.unavailable)}
        {r.unavailable > 0 && (
          <small className="usage-unreported">{n(r.unavailable)} unreported</small>
        )}
      </span>
    ),
  },
];

// Reads saved usage records only; viewing never calls a model.
export default function UsageDashboard({
  api,
  providers,
}: {
  api: (path: string) => Promise<any>;
  providers?: Record<string, { label: string }>;
}) {
  const now = new Date();
  const [range, setRange] = useState<UsageRange>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [cumulative, setCumulative] = useState(false);
  const [group, setGroup] = useState('model');
  const [data, setData] = useState<{
    first: number | null;
    events: UsageEvent[];
    selection: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const chart = useRef<SVGSVGElement>(null);
  const selection = `${range}:${year}`;
  useEffect(() => {
    let current = true;
    setError('');
    const s = span(range, new Date(), year, null);
    api(range === 'all' ? '/api/usage' : `/api/usage?from=${+s.from}&to=${+s.to}`).then(
      (d) => {
        if (current) {
          setData({ ...d, selection });
          setActive(-1);
        }
      },
      (e) => {
        if (current) setError(e.message);
      },
    );
    return () => {
      current = false;
    };
  }, [range, year]);

  const s = span(range, now, year, data?.first ?? null),
    unit = s.unit;
  const ready = data?.selection === selection;
  const events = ready ? data.events : [],
    rows = buckets(events, s, cumulative),
    sum = totals(events);
  const max = Math.max(1, ...rows.map(total)),
    shown = rows[active];
  const rangeLabel = {
    today: 'today',
    week: 'this week',
    month: `in ${now.toLocaleDateString(undefined, { month: 'long' })}`,
    year: `in ${year}`,
    all: 'all time',
  }[range];
  const years = Array.from(
    { length: now.getFullYear() - new Date(data?.first ?? now).getFullYear() + 1 },
    (_, i) => String(now.getFullYear() - i),
  );
  const move = (i: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, i));
    setActive(next);
    chart.current?.querySelectorAll<SVGGElement>('.usage-bar')[next]?.focus();
  };
  const periodLabel = (i: number) =>
    label(rows[i].start, unit) + (cumulative ? ' (cumulative)' : '');

  return (
    <VStack gap={6} className="usage-dashboard" aria-busy={!ready && !error}>
      <HStack gap={3} wrap="wrap" vAlign="end">
        <SegmentedControl
          label="Usage range"
          value={range}
          onChange={(v) => setRange(v as UsageRange)}
        >
          <SegmentedControlItem value="today" label="Today" />
          <SegmentedControlItem value="week" label="Week" />
          <SegmentedControlItem value="month" label="Month" />
          <SegmentedControlItem value="year" label="Year" />
          <SegmentedControlItem value="all" label="All time" />
        </SegmentedControl>
        {range === 'year' && (
          <Selector
            label="Year"
            isLabelHidden
            options={years}
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            width="7rem"
          />
        )}
      </HStack>
      {error && <Banner status="error" title="Usage history could not load" description={error} />}
      {!ready && !error && (
        <Text color="secondary" role="status">
          Loading usage history…
        </Text>
      )}
      {ready && (
        <>
          <VStack gap={3} className="usage-summary">
            <Text className="usage-total">
              {cell(sum, 'total')} <small>tokens {rangeLabel}</small>
            </Text>
            <HStack gap={4} wrap="wrap" vAlign="center" className="usage-legend">
              {SERIES.map(([key, name]) => (
                <HStack key={key} gap={1} vAlign="center">
                  <span className="usage-swatch" data-series={key} aria-hidden="true" />
                  <Text type="supporting" color="secondary">
                    <b>{cell(sum, key)}</b> {name.toLowerCase()}
                  </Text>
                </HStack>
              ))}
              <Text type="supporting" color="secondary">
                {calls(sum)}
              </Text>
            </HStack>
          </VStack>
          {events.length === 0 ? (
            <Text color="secondary" className="usage-empty">
              No usage recorded in this range. Replies and suggestions add to this history as
              providers report their tokens.
            </Text>
          ) : (
            <VStack
              gap={3}
              as="section"
              className="usage-section"
              aria-labelledby="usage-chart-heading"
            >
              <HStack
                hAlign="between"
                vAlign="center"
                gap={3}
                wrap="wrap"
                className="usage-section-head"
              >
                <Heading level={3} id="usage-chart-heading">
                  Per {unit}
                </Heading>
                <SegmentedControl
                  label="Chart view"
                  value={cumulative ? 'cumulative' : 'trend'}
                  onChange={(v) => {
                    setCumulative(v === 'cumulative');
                    setActive(-1);
                  }}
                >
                  <SegmentedControlItem value="trend" label="Per period" />
                  <SegmentedControlItem value="cumulative" label="Cumulative" />
                </SegmentedControl>
              </HStack>
              <div className="usage-chart">
                <div className="usage-scale" aria-hidden="true">
                  {[max, (max * 2) / 3, max / 3, 0].map((v, i) => (
                    <span key={i}>{n(Math.round(v))}</span>
                  ))}
                </div>
                <svg
                  ref={chart}
                  viewBox={`0 0 ${rows.length * 10} 100`}
                  preserveAspectRatio="none"
                  role="group"
                  aria-label={`${cumulative ? 'Cumulative' : 'Per-period'} token usage by ${unit}. Use arrow keys to read each ${unit}.`}
                  onMouseLeave={() => setActive(-1)}
                >
                  {[0, 100 / 3, 200 / 3, 100].map((y) => (
                    <line
                      key={y}
                      className="usage-grid"
                      x1={0}
                      x2={rows.length * 10}
                      y1={y}
                      y2={y}
                    />
                  ))}
                  {rows.map((r, i) => {
                    let y = 100;
                    return (
                      <g
                        key={+r.start}
                        className="usage-bar"
                        data-active={i === active}
                        tabIndex={i === Math.max(active, 0) ? 0 : -1}
                        role="img"
                        aria-label={`${periodLabel(i)}: ${counts(r)}; ${calls(r)}`}
                        onMouseEnter={() => setActive(i)}
                        onFocus={() => setActive(i)}
                        onKeyDown={(e) => {
                          const to = {
                            ArrowLeft: i - 1,
                            ArrowRight: i + 1,
                            Home: 0,
                            End: rows.length - 1,
                          }[e.key];
                          if (to !== undefined) {
                            e.preventDefault();
                            move(to);
                          }
                        }}
                      >
                        <rect className="usage-hit" x={i * 10} y={0} width={10} height={100} />
                        {SERIES.map(([key]) => {
                          const h = (r[key] / max) * 100;
                          y -= h;
                          return (
                            h > 0 && (
                              <rect
                                key={key}
                                data-series={key}
                                x={i * 10 + 1.5}
                                y={y}
                                width={7}
                                height={h}
                              />
                            )
                          );
                        })}
                      </g>
                    );
                  })}
                </svg>
                <HStack hAlign="between" gap={2} className="usage-axis" aria-hidden>
                  <Text type="supporting" color="secondary">
                    {label(rows[0].start, unit)}
                  </Text>
                  {rows.length > 2 && (
                    <Text type="supporting" color="secondary">
                      {label(rows[Math.floor(rows.length / 2)].start, unit)}
                    </Text>
                  )}
                  <Text type="supporting" color="secondary">
                    {label(rows.at(-1)!.start, unit)}
                  </Text>
                </HStack>
              </div>
              <Text type="supporting" aria-live="polite" className="usage-readout">
                {shown
                  ? `${periodLabel(active)}: ${counts(shown)}; ${calls(shown)}`
                  : 'Hover or focus a bar for its exact values.'}
              </Text>
              <Collapsible defaultIsOpen={false} trigger={<Text>Values for each {unit}</Text>}>
                <Table
                  aria-label={`Values for each ${unit}`}
                  density="compact"
                  textOverflow="wrap"
                  data={rows.map((r, i) => ({
                    id: +r.start,
                    name: periodLabel(i),
                    ...r,
                    total: total(r),
                  }))}
                  idKey="id"
                  columns={columns(unit[0].toUpperCase() + unit.slice(1))}
                />
              </Collapsible>
            </VStack>
          )}
          {events.length > 0 && (
            <VStack
              gap={3}
              as="section"
              className="usage-section usage-breakdown"
              aria-labelledby="usage-breakdown-heading"
            >
              <HStack
                hAlign="between"
                vAlign="center"
                gap={3}
                wrap="wrap"
                className="usage-section-head"
              >
                <Heading level={3} id="usage-breakdown-heading">
                  Breakdown
                </Heading>
                <SegmentedControl label="Break down by" value={group} onChange={setGroup}>
                  <SegmentedControlItem value="model" label="By model" />
                  <SegmentedControlItem value="task" label="By task" />
                </SegmentedControl>
              </HStack>
              <Table
                aria-label={`Usage by ${group}`}
                density="compact"
                textOverflow="wrap"
                data={breakdown(events, (e) => {
                  if (group === 'task') return TASKS[e.task] ?? e.task;
                  const provider = e.provider
                    ? (providers?.[e.provider]?.label ?? e.provider)
                    : null;
                  return e.model
                    ? `${e.model} (${provider ?? 'provider not reported'})`
                    : provider
                      ? `${provider}, model not reported`
                      : 'Unknown model (saved before attribution)';
                })}
                idKey="name"
                columns={columns(group === 'model' ? 'Model' : 'Task', sum)}
              />
              <Text type="supporting" color="secondary">
                Counts are what providers reported. Calls without counts are listed, never
                estimated. Shares use reported tokens only.
              </Text>
            </VStack>
          )}
        </>
      )}
    </VStack>
  );
}
