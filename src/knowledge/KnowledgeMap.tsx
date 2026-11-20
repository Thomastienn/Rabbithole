import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { select, zoom, zoomIdentity, type ZoomBehavior } from 'd3';
import { HStack } from '@astryxdesign/core/Layout';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ArrowsPointingOutIcon, MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import { layoutConcepts, POINT_SPACE } from './knowledgeLayout';
import type { KnowledgeState } from './useKnowledge';
import ConceptDetail from './ConceptDetail';
import {
    level,
    fill,
    MIN_SCALE,
    LABEL_SCALE,
    graphShape,
    conceptLines,
    fitKnowledge,
} from './knowledge';
export default function KnowledgeMap(knowledge: KnowledgeState) {
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
    const lines = conceptLines(graph?.links ?? [], at, selected?.name);
    function fit() {
        const box = field.current,
            z = zoomer.current;
        if (!box || !z || !places.length || !box.clientWidth) return;
        const { x, y, k } = fitKnowledge(places, regions, box.clientWidth, box.clientHeight);
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
                                    <circle
                                        key={r.name}
                                        data-topic={r.name}
                                        cx={r.x}
                                        cy={r.y}
                                        r={r.radius}
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
                            {graph.concepts.map((c) => {
                                const p = at.get(c.name);
                                return (
                                    p && (
                                        <button
                                            key={c.name}
                                            type="button"
                                            className="concept-point"
                                            data-concept={c.name}
                                            style={{ left: p.x, top: p.y }}
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
                            {regions.map((r) => (
                                <span
                                    key={r.name}
                                    className="topic-label"
                                    data-topic-label={r.name}
                                    style={{
                                        left: r.x,
                                        top: r.y,
                                        maxWidth: Math.max(
                                            96,
                                            POINT_SPACE * 4 * Math.min(1, view.k),
                                        ),
                                        transform: `translate(-50%, -50%) scale(${1 / view.k})`,
                                    }}
                                >
                                    {r.name}
                                </span>
                            ))}
                        </div>
                        <HStack
                            padding={1}
                            gap={1}
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
                                size="sm"
                                onClick={() =>
                                    field.current &&
                                    zoomer.current &&
                                    select(field.current).call(zoomer.current.scaleBy, 0.8)
                                }
                            />
                            <IconButton
                                label="Zoom in"
                                tooltip="Zoom in"
                                icon={<PlusIcon />}
                                variant="ghost"
                                size="sm"
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
                                size="sm"
                                onClick={fit}
                            />
                        </HStack>
                        <div className="knowledge-key" aria-label="Key">
                            <span>
                                <i className="fam" data-fill="none" />
                                Unfamiliar
                            </span>
                            <span>
                                <i className="fam" data-fill="some" />
                                Some familiarity
                            </span>
                            <span>
                                <i className="fam" data-fill="full" />
                                Familiar
                            </span>
                            <span>Line: related</span>
                            <span>Arrow: builds on</span>
                        </div>
                    </div>
                </div>
                <ConceptDetail graph={graph} selected={selected} />
            </div>
        )
    );
}
