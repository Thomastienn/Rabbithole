import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { select, zoom, zoomIdentity, type ZoomBehavior } from 'd3';
import { HStack } from '@astryxdesign/core/Layout';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Text } from '@astryxdesign/core/Text';
import { ArrowsPointingOutIcon, MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import { layoutConcepts } from './knowledgeLayout';
import type { KnowledgeState } from './useKnowledge';
import ConceptDetail, { type OpenSource } from './ConceptDetail';
import {
    level,
    fill,
    MIN_SCALE,
    LABEL_SCALE,
    graphShape,
    conceptLines,
    fitKnowledge,
} from './knowledge';
// The legend's room at the foot of the field (mockup inset 8px 8px 124px): Fit keeps the graph above it.
const LEGEND_ROOM = 124;

export default function KnowledgeMap({
    open,
    ...knowledge
}: KnowledgeState & { open: OpenSource }) {
    const { graph, selected, setChosen } = knowledge;
    const field = useRef<HTMLDivElement>(null);
    const zoomer = useRef<ZoomBehavior<HTMLDivElement, unknown>>(undefined);
    const fitted = useRef('');
    const [view, setView] = useState(zoomIdentity);
    const hasMap = !!(graph && selected);
    // Familiarity refreshes leave points in place; only concepts, topic membership or links refit the view.
    const shape = graph ? graphShape(graph) : '';
    const { points: places, regions } = useMemo(
        () => (graph ? layoutConcepts(graph) : { points: [], regions: [] }),
        [shape],
    );
    const at = useMemo(() => new Map(places.map((p) => [p.name, p])), [places]);
    const hue = new Map(regions.map((r) => [r.name, r.hue]));
    const lines = conceptLines(graph?.links ?? [], at, selected?.name);
    function fit() {
        const box = field.current,
            z = zoomer.current;
        if (!box || !z || !places.length || !box.clientWidth) return;
        const { x, y, k } = fitKnowledge(
            places,
            regions,
            box.clientWidth,
            box.clientHeight - LEGEND_ROOM,
        );
        fitted.current = shape;
        select(box).call(z.transform, zoomIdentity.translate(x, y).scale(k));
    }
    // Pan and zoom like the learning tree map: drag, wheel, double-click and the toolbar.
    useLayoutEffect(() => {
        const box = field.current;
        if (!box) return;
        const z = zoom<HTMLDivElement, unknown>()
            .scaleExtent([MIN_SCALE, 2.5])
            .clickDistance(4)
            .filter(
                (e) =>
                    !e.button &&
                    !(e.target as Element).closest('.map-toolbar') &&
                    !(e.type === 'dblclick' && (e.target as Element).closest('button')),
            )
            .on('zoom', (e) => setView(e.transform));
        zoomer.current = z;
        select(box).call(z);
        return () => {
            select(box).on('.zoom', null);
            zoomer.current = undefined;
        };
    }, [hasMap]);
    // Fit before paint so a new layout never shows unfitted; a hidden panel (zero size) fits once it has a size.
    useLayoutEffect(() => {
        const box = field.current;
        if (!box) return;
        if (fitted.current !== shape) fit();
        const observer = new ResizeObserver(() => {
            if (fitted.current !== shape) fit();
        });
        observer.observe(box);
        return () => observer.disconnect();
    }, [shape, hasMap]);
    // Keyboard focus on a point outside the view pans it into view.
    function reveal(name: string) {
        const box = field.current,
            z = zoomer.current,
            p = at.get(name);
        if (!box || !z || !p) return;
        const [x, y] = view.apply([p.x, p.y]);
        if (x < 40 || y < 40 || x > box.clientWidth - 40 || y > box.clientHeight - 40)
            select(box).call(z.translateTo, p.x, p.y);
    }
    return (
        graph &&
        selected && (
            <div className="knowledge-body">
                <div>
                    <div
                        className="knowledge-field"
                        ref={field}
                        role="region"
                        aria-label="Knowledge map"
                    >
                        <div
                            className="knowledge-map"
                            style={{
                                transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
                                visibility: fitted.current === shape ? undefined : 'hidden',
                            }}
                        >
                            <svg className="knowledge-regions" aria-hidden="true">
                                {regions.map((r) => (
                                    <path
                                        key={r.name}
                                        data-topic={r.name}
                                        d={`M${r.hull.join('L')}Z`}
                                        data-hue={r.hue}
                                        style={{ '--h': r.hue } as CSSProperties}
                                    />
                                ))}
                            </svg>
                            <svg className="knowledge-links" aria-hidden="true">
                                <defs>
                                    <marker
                                        id="knowledge-arrow"
                                        viewBox="0 0 10 10"
                                        refX="9"
                                        refY="5"
                                        markerWidth="7"
                                        markerHeight="7"
                                        orient="auto"
                                    >
                                        <path d="M0 0 10 5 0 10z" />
                                    </marker>
                                </defs>
                                {lines.map((l) => (
                                    <line
                                        key={l.key}
                                        x1={l.x1}
                                        y1={l.y1}
                                        x2={l.x2}
                                        y2={l.y2}
                                        data-kind={l.kind}
                                        data-selected={l.selected}
                                        markerEnd={
                                            l.kind === 'builds on'
                                                ? 'url(#knowledge-arrow)'
                                                : undefined
                                        }
                                    />
                                ))}
                            </svg>
                            {/* Topic names sit above their hulls, behind the concepts, at screen size. */}
                            {regions.map((r) => (
                                <span
                                    key={r.name}
                                    className="topic-label"
                                    data-topic-label={r.name}
                                    style={{
                                        left: r.x,
                                        top: r.y,
                                        transform: `translate(-50%, -100%) scale(${1 / view.k})`,
                                    }}
                                >
                                    {r.name}
                                </span>
                            ))}
                            {graph.concepts.map((c) => {
                                const p = at.get(c.name),
                                    h = hue.get(c.topics[0]);
                                return (
                                    p && (
                                        <button
                                            key={c.name}
                                            type="button"
                                            className="concept-point"
                                            data-concept={c.name}
                                            data-hue={h}
                                            style={
                                                { left: p.x, top: p.y, '--h': h } as CSSProperties
                                            }
                                            aria-pressed={c === selected}
                                            aria-controls="concept-detail"
                                            onFocus={() => reveal(c.name)}
                                            onClick={() => setChosen(c.name)}
                                        >
                                            <i
                                                className="fam"
                                                data-fill={fill(c)}
                                                aria-hidden="true"
                                            />
                                            <span
                                                className={
                                                    view.k < LABEL_SCALE && c !== selected
                                                        ? 'concept-name sr-only'
                                                        : 'concept-name'
                                                }
                                            >
                                                {c.name}
                                            </span>
                                            <span className="sr-only">, {level(c)}</span>
                                        </button>
                                    )
                                );
                            })}
                        </div>
                        <HStack
                            gap={0}
                            vAlign="center"
                            className="map-toolbar"
                            role="group"
                            aria-label="Knowledge map controls"
                        >
                            <IconButton
                                label="Zoom out"
                                tooltip="Zoom out"
                                icon={<MinusIcon />}
                                variant="ghost"
                                size="lg"
                                onClick={() =>
                                    field.current &&
                                    zoomer.current &&
                                    select(field.current).call(zoomer.current.scaleBy, 0.8)
                                }
                            />
                            <Text className="sr-only">Current zoom</Text>
                            <Text type="supporting" hasTabularNumbers>
                                {Math.round(view.k * 100)}%
                            </Text>
                            <IconButton
                                label="Zoom in"
                                tooltip="Zoom in"
                                icon={<PlusIcon />}
                                variant="ghost"
                                size="lg"
                                onClick={() =>
                                    field.current &&
                                    zoomer.current &&
                                    select(field.current).call(zoomer.current.scaleBy, 1.25)
                                }
                            />
                            <IconButton
                                label="Fit map"
                                tooltip="Fit map"
                                icon={<ArrowsPointingOutIcon />}
                                variant="ghost"
                                size="lg"
                                onClick={fit}
                            />
                        </HStack>
                        <div className="knowledge-key" aria-label="Legend">
                            <span>
                                <i className="fam" data-fill="none" />
                                New to you
                            </span>
                            <span>
                                <i className="fam" data-fill="some" />
                                Getting there
                            </span>
                            <span>
                                <i className="fam" data-fill="full" />
                                You know this
                            </span>
                            <span>
                                Colour shows the topic. An arrow points to the concept that builds
                                on the other.
                            </span>
                        </div>
                    </div>
                </div>
                <ConceptDetail graph={graph} selected={selected} open={open} />
            </div>
        )
    );
}
