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
    compact,
    label,
    span,
    total,
    totals,
    type Totals,
    type UsageEvent,
    type UsageRange,
} from './usage';
import { request as api } from '../serverAccess';

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
    verdict: 'Familiarity verdicts',
    brief: 'Brief explanations',
    merge: 'Concept merges',
    filler: 'Board fillers',
};
const n = (v: number) => v.toLocaleString();
const counts = (t: Totals) =>
    !t.calls && t.unavailable
        ? 'Token counts not reported'
        : `${n(t.input)} input, ${n(t.output)} output${reasoning(t)}, ${n(t.cacheRead)} cache-read tokens (${n(total(t))} total)`;
const reasoning = (t: Totals) => (t.reasoning === null ? '' : ` (${n(t.reasoning)} reasoning)`);
const calls = (t: Totals) =>
    `${n(t.calls + t.unavailable)} call${t.calls + t.unavailable === 1 ? '' : 's'}${t.unavailable ? `, ${n(t.unavailable)} without reported counts` : ''}`;
// A group with only unreported calls shows a dash, not zero tokens.
const cell = (r: Totals, key: 'input' | 'output' | 'cacheRead' | 'total', format = n) =>
    r.calls === 0 && r.unavailable ? '—' : format(key === 'total' ? total(r) : r[key]);
type Row = ReturnType<typeof breakdown>[number];
// The values for each period: every series, exact.
const columns = (first: string) => [
    {
        key: 'name',
        header: first,
        width: proportional(2, { minWidth: 180 }),
        renderCell: (r: Row) => <div className="usage-name">{r.name}</div>,
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
// Breakdown (mockup Usage): name, replies, compact tokens, then the share as a percent over a bar.
const shareColumns = (first: string, sum: Totals) => [
    {
        key: 'name',
        header: first,
        width: proportional(3, { minWidth: 180 }),
        renderCell: (r: Row) => <div className="usage-name">{r.name}</div>,
    },
    {
        key: 'replies',
        header: 'Replies',
        width: proportional(1, { minWidth: 80 }),
        align: 'end' as const,
        renderCell: (r: Row) => n(r.calls + r.unavailable),
    },
    {
        key: 'total',
        header: 'Tokens',
        width: proportional(1, { minWidth: 80 }),
        align: 'end' as const,
        renderCell: (r: Row) => cell(r, 'total', compact),
    },
    {
        key: 'share',
        header: 'Share',
        width: proportional(2, { minWidth: 140 }),
        renderCell: (r: Row) => {
            if (r.calls === 0 && r.unavailable > 0)
                return <small className="usage-unreported usage-nocount">No count reported</small>;
            const share = total(sum) ? (r.total / total(sum)) * 100 : 0;
            return (
                <>
                    {Math.round(share)}%
                    <span
                        className="usage-share"
                        role="img"
                        aria-label={`${share.toLocaleString(undefined, { maximumFractionDigits: 1 })}% of reported tokens`}
                    >
                        <i style={{ width: `${share}%` }} />
                    </span>
                </>
            );
        },
    },
];

// Fills that tell the series apart without colour: input solid, output striped, cache read dotted.
function SeriesPatterns() {
    return (
        <defs>
            <pattern id="usage-output" width={3} height={3} patternUnits="userSpaceOnUse">
                <rect className="usage-fill" width={3} height={3} />
                <path className="usage-mark" d="M0 3L3 0" />
            </pattern>
            <pattern id="usage-cacheRead" width={3} height={3} patternUnits="userSpaceOnUse">
                <rect className="usage-fill" width={3} height={3} />
                <circle className="usage-dot" cx={1.5} cy={1.5} r={0.6} />
            </pattern>
        </defs>
    );
}

// Reads saved usage records only; viewing never calls a model.
export default function UsageDashboard({
    providers,
}: {
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
    const titles = new Map(events.flatMap((e) => (e.tree ? [[e.tree, e.treeTitle ?? '']] : [])));
    // The tallest bar fills the chart; there is no y scale (mockup Usage).
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
            <svg className="usage-defs" aria-hidden="true">
                <SeriesPatterns />
            </svg>
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
            {error && (
                <Banner status="error" title="Usage history could not load" description={error} />
            )}
            {!ready && !error && (
                <Text color="secondary" role="status">
                    Loading usage history…
                </Text>
            )}
            {/* Before the first reply (mockup Usage, empty). */}
            {ready && data.first === null && (
                <VStack gap={1} className="usage-none">
                    <Heading level={2}>No usage yet</Heading>
                    <Text color="secondary">Token counts appear here after your first reply.</Text>
                </VStack>
            )}
            {ready && data.first !== null && (
                <>
                    <VStack gap={3} className="usage-summary">
                        <Text className="usage-total">
                            {cell(sum, 'total', compact)} <small>tokens {rangeLabel}</small>
                        </Text>
                        <HStack gap={4} wrap="wrap" vAlign="center" className="usage-legend">
                            {SERIES.map(([key, name]) => (
                                <HStack key={key} gap={1} vAlign="center">
                                    <svg
                                        className="usage-swatch"
                                        viewBox="0 0 14 5"
                                        aria-hidden="true"
                                    >
                                        <rect data-series={key} width={14} height={5} rx={2.5} />
                                    </svg>
                                    <Text type="supporting" color="secondary">
                                        {name} <b>{cell(sum, key, compact)}</b>
                                        {key === 'output' && reasoning(sum)}
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
                            No usage recorded in this range. Replies and suggestions add to this
                            history as providers report their tokens.
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
                                <svg
                                    ref={chart}
                                    viewBox={`0 0 ${rows.length * 10} 100`}
                                    preserveAspectRatio="none"
                                    role="group"
                                    aria-label={`${cumulative ? 'Cumulative' : 'Per-period'} token usage by ${unit}. Use arrow keys to read each ${unit}.`}
                                    onMouseLeave={() => setActive(-1)}
                                >
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
                                                <rect
                                                    className="usage-hit"
                                                    x={i * 10}
                                                    y={0}
                                                    width={10}
                                                    height={100}
                                                />
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
                            <Collapsible
                                defaultIsOpen={false}
                                trigger={<Text>Values for each {unit}</Text>}
                            >
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
                                <SegmentedControl
                                    label="Break down by"
                                    value={group}
                                    onChange={setGroup}
                                >
                                    <SegmentedControlItem value="model" label="By model" />
                                    <SegmentedControlItem value="task" label="By task" />
                                    <SegmentedControlItem value="tree" label="By tree" />
                                </SegmentedControl>
                            </HStack>
                            <Table
                                aria-label={`Usage by ${group}`}
                                textOverflow="wrap"
                                data={breakdown(events, (e) => {
                                    if (group === 'task') return TASKS[e.task] ?? e.task;
                                    if (group === 'tree') return e.tree ?? '';
                                    const provider = e.provider
                                        ? (providers?.[e.provider]?.label ?? e.provider)
                                        : null;
                                    return e.model
                                        ? `${e.model} (${provider ?? 'provider not reported'})`
                                        : provider
                                          ? `${provider}, model not reported`
                                          : 'Unknown model (saved before attribution)';
                                }).map((r) => ({
                                    ...r,
                                    id: r.name,
                                    name:
                                        group !== 'tree'
                                            ? r.name
                                            : (titles.get(r.name) ??
                                              'No tree (background work or deleted trees)'),
                                }))}
                                idKey="id"
                                columns={shareColumns(
                                    { model: 'Model', task: 'Task', tree: 'Learning tree' }[group]!,
                                    sum,
                                )}
                            />
                            <Text type="supporting" color="secondary">
                                Counts are what providers reported. Calls without counts are listed,
                                never estimated. Shares use reported tokens only.
                            </Text>
                        </VStack>
                    )}
                </>
            )}
        </VStack>
    );
}
