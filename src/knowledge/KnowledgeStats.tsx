import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Heading, Text } from '@astryxdesign/core/Text';
import { CheckIcon } from '@heroicons/react/24/outline';
import { request as api } from '../serverAccess';
import type { KnowledgeState } from './useKnowledge';
import { fill, level } from './knowledge';
import { topicPlaces } from './knowledgeLayout';
import { inkStyle } from '../map/treeList';
import { heatDays, HEAT_WEEKS, type Stats } from './stats';

const date = (at: number | Date) =>
    new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Section({
    title,
    note,
    wide,
    children,
}: {
    title: string;
    note: string;
    wide?: boolean;
    children: ReactNode;
}) {
    return (
        <section className={wide ? 'stats-section wide' : 'stats-section'}>
            <Heading level={3}>{title}</Heading>
            <Text color="secondary">{note}</Text>
            {children}
        </section>
    );
}

function Growth({ growth }: { growth: Stats['growth'] }) {
    if (growth.length < 2)
        return <p className="stats-none">The chart starts after your first week of questions.</p>;
    const first = growth[0],
        last = growth.at(-1)!;
    // Met never falls, so the last point is the top of the scale.
    const top = Math.max(10, Math.ceil(last.met / 10) * 10);
    const X = (i: number) => 34 + (i * 420) / (growth.length - 1),
        Y = (v: number) => 186 - (v / top) * 170;
    const path = (key: 'met' | 'known') =>
        'M' + growth.map((p, i) => `${X(i).toFixed(1)} ${Y(p[key]).toFixed(1)}`).join('L');
    return (
        <>
            <svg
                className="stats-chart"
                viewBox="0 0 520 210"
                role="img"
                aria-label={`Concepts met went from ${first.met} to ${last.met} and concepts known from ${first.known} to ${last.known} over ${plural(growth.length - 1, 'week')}.`}
            >
                {[0, top / 2, top].map((v) => (
                    <g key={v}>
                        <line className="grid" x1="34" x2="454" y1={Y(v)} y2={Y(v)} />
                        <text className="ax" x="26" y={Y(v) + 4} textAnchor="end">
                            {v}
                        </text>
                    </g>
                ))}
                {/* A tick at each point that starts a new month. */}
                {growth.map(
                    (p, i) =>
                        (i === 0 ||
                            new Date(p.at).getMonth() !==
                                new Date(growth[i - 1].at).getMonth()) && (
                            <text key={p.at} className="ax" x={X(i)} y="206" textAnchor="middle">
                                {new Date(p.at).toLocaleDateString(undefined, { month: 'short' })}
                            </text>
                        ),
                )}
                <path className="met" d={path('met')} />
                <path className="known" d={path('known')} />
                <text className="end met-end" x={464} y={Y(last.met) + 4}>
                    Met {last.met}
                </text>
                <text className="end known-end" x={464} y={Y(last.known) + 4}>
                    Known {last.known}
                </text>
            </svg>
            <table className="sr-only">
                <caption>Concepts met and known by week</caption>
                <thead>
                    <tr>
                        <th>Week ending</th>
                        <th>Met</th>
                        <th>Known</th>
                    </tr>
                </thead>
                <tbody>
                    {growth.map((p) => (
                        <tr key={p.at}>
                            <td>{date(p.at)}</td>
                            <td>{p.met}</td>
                            <td>{p.known}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

function Activity({ activity }: { activity: Stats['activity'] }) {
    const days = heatDays(activity, new Date());
    const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, w) =>
        days.slice(w * 7, w * 7 + 7),
    );
    const busiest = days.reduce((a, b) => (b.messages > a.messages ? b : a));
    const day = (d: Date) =>
        d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    if (!busiest.messages)
        return <p className="stats-none">No messages in the last {HEAT_WEEKS} weeks.</p>;
    return (
        <>
            <div
                className="stats-heat"
                role="img"
                aria-label={`Messages per day over the last ${HEAT_WEEKS} weeks. Busiest day: ${plural(busiest.messages, 'message')} on ${day(busiest.date)}.`}
            >
                <div className="months" aria-hidden="true">
                    {weeks.map((w, i) => (
                        <span key={i}>
                            {i > 0 && w[0].date.getMonth() !== weeks[i - 1][0].date.getMonth()
                                ? w[0].date.toLocaleDateString(undefined, { month: 'short' })
                                : ''}
                        </span>
                    ))}
                </div>
                <div className="days" aria-hidden="true">
                    <span />
                    <span>Mon</span>
                    <span />
                    <span>Wed</span>
                    <span />
                    <span>Fri</span>
                    <span />
                </div>
                <div className="cells" aria-hidden="true">
                    {days.map((d) => (
                        <i
                            key={d.date.getTime()}
                            data-l={d.level}
                            title={`${plural(d.messages, 'message')} on ${day(d.date)}`}
                        />
                    ))}
                </div>
            </div>
            <div className="stats-key" aria-hidden="true">
                Fewer
                {[0, 1, 2, 3, 4].map((l) => (
                    <i key={l} data-l={l} />
                ))}
                More
            </div>
            <table className="sr-only">
                <caption>Messages by week</caption>
                <thead>
                    <tr>
                        <th>Week of</th>
                        <th>Messages</th>
                    </tr>
                </thead>
                <tbody>
                    {weeks.map((w) => (
                        <tr key={w[0].date.getTime()}>
                            <td>{date(w[0].date)}</td>
                            <td>{w.reduce((s, d) => s + d.messages, 0)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Under the graph: how knowledge grows, read-only. Choosing a concept selects it and focuses its detail.
export default function KnowledgeStats({ graph, setChosen }: KnowledgeState) {
    const [stats, setStats] = useState<Stats>();
    const [error, setError] = useState('');
    // Refetched with every graph load, so Refresh and new activity update both.
    useEffect(() => {
        if (!graph?.concepts.length) return;
        let live = true;
        api('/api/graph/stats').then(
            (s: Stats) => live && (setStats(s), setError('')),
            (e: Error) => live && setError(e.message),
        );
        return () => {
            live = false;
        };
    }, [graph]);
    if (!graph?.concepts.length) return null;
    if (error) return <Text role="alert">{error}</Text>;
    if (!stats) return null;
    const byName = new Map(graph.concepts.map((c) => [c.name, c]));
    const hue = new Map(topicPlaces(graph).map((t) => [t.name, t.hue]));
    function choose(name: string) {
        setChosen(name);
        requestAnimationFrame(() => document.getElementById('concept-detail')?.focus());
    }
    const row = (name: string, key: string, className: string, children: ReactNode) => (
        <li key={key}>
            <button
                type="button"
                className={`stats-row ${className}`}
                data-stats-concept={name}
                aria-controls="concept-detail"
                onClick={() => choose(name)}
            >
                {children}
            </button>
        </li>
    );
    return (
        <section className="knowledge-stats" aria-labelledby="knowledge-stats-heading">
            <header>
                <Heading level={2} id="knowledge-stats-heading">
                    How your knowledge grows
                </Heading>
                {stats.since !== null && (
                    <Text color="secondary">
                        From every learning tree since {date(stats.since)}.
                    </Text>
                )}
            </header>
            <div className="stats-grid">
                <Section
                    title="Concepts met and known"
                    note="Known means the ring is full on the graph."
                >
                    <Growth growth={stats.growth} />
                </Section>
                <Section
                    title="Topics by familiarity"
                    note="Mean familiarity of each topic's concepts, strongest first."
                >
                    {stats.topics.length ? (
                        <ol className="stats-rank">
                            {stats.topics.map((t) => (
                                <li key={t.name}>
                                    <i
                                        className="swatch"
                                        data-hue={hue.get(t.name)}
                                        style={{ '--h': hue.get(t.name) } as CSSProperties}
                                        aria-hidden="true"
                                    />
                                    <span>{t.name}</span>
                                    <span className="track" role="img" aria-label={level(t)}>
                                        <b style={{ width: `${t.familiarity * 100}%` }} />
                                    </span>
                                    <small>
                                        {level(t)} · {plural(t.concepts, 'concept')}
                                    </small>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="stats-none">No topics yet.</p>
                    )}
                </Section>
                <Section
                    title="Fading"
                    note="Concepts you knew that have slipped back. Worth a second look."
                >
                    {stats.fading.length ? (
                        <ul className="stats-list">
                            {stats.fading.map((f) => {
                                const c = byName.get(f.name);
                                return row(
                                    f.name,
                                    f.name,
                                    'fading',
                                    <>
                                        <i
                                            className="fam"
                                            data-fill={c ? fill(c) : 'none'}
                                            aria-hidden="true"
                                        />
                                        <span>
                                            <b>{f.name}</b>
                                            <small>{c?.topics.join(', ')}</small>
                                        </span>
                                        <small>Known until {date(f.until)}</small>
                                    </>,
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="stats-none">Nothing is fading.</p>
                    )}
                </Section>
                <Section
                    title="Misconceptions"
                    note="Newest first. Cleared means a later message showed the idea right."
                >
                    {stats.misconceptions.length ? (
                        <ul className="stats-list">
                            {stats.misconceptions.map((m) =>
                                row(
                                    m.name,
                                    `${m.name}-${m.at}`,
                                    'misconception',
                                    <>
                                        <small>{date(m.at)}</small>
                                        <span>
                                            <b>{m.name}</b>
                                            <small>
                                                {m.place && (
                                                    <span
                                                        className="address-chip"
                                                        style={inkStyle(m.place.ink)}
                                                    >
                                                        {m.place.address}
                                                    </span>
                                                )}
                                                {m.text}
                                            </small>
                                        </span>
                                        <span className={m.cleared ? 'cleared' : 'open'}>
                                            {m.cleared ? (
                                                <>
                                                    <CheckIcon aria-hidden="true" />
                                                    Cleared {date(m.cleared)}
                                                </>
                                            ) : (
                                                'Not cleared yet'
                                            )}
                                        </span>
                                    </>,
                                ),
                            )}
                        </ul>
                    ) : (
                        <p className="stats-none">No misconceptions recorded.</p>
                    )}
                </Section>
                <Section
                    title="Activity"
                    note={`Messages you sent each day, last ${HEAT_WEEKS} weeks.`}
                    wide
                >
                    <Activity activity={stats.activity} />
                </Section>
            </div>
        </section>
    );
}
