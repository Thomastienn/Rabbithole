import { useEffect, useId, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import {
    ArrowsPointingOutIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    CodeBracketIcon,
} from '@heroicons/react/24/outline';
import { Lightbox } from '@astryxdesign/core/Lightbox';
import { useTheme } from '@astryxdesign/core/theme';
import { renderArtifact, type Artifact, type DiagramState } from './artifacts';

export default function DiagramCard({
    artifact,
    steps = [artifact],
    figure,
    onRetry,
}: {
    artifact: Artifact;
    steps?: Artifact[];
    // Its number in the tree's Figures list, shown as "Fig N ·" (mockup Read .figc).
    figure?: number;
    onRetry?: () => Promise<void>;
}) {
    const id = useId();
    const card = useRef<HTMLElement>(null);
    const [drawing, setDrawing] = useState<DiagramState>({ status: 'pending' });
    const { mode, name } = useTheme();
    const [enlarged, setEnlarged] = useState(false);
    // Keeps the Retry button mounted (loading) while its rerun is pending, so keyboard focus stays put.
    const [retried, setRetried] = useState(false);
    const [renderAttempt, setRenderAttempt] = useState(0);
    // Unset until the learner toggles it: the source starts open only as a failed drawing's fallback.
    const [sourceShown, setSourceShown] = useState<boolean>();
    useEffect(() => {
        let cancelled = false;
        setDrawing({ status: 'pending' });
        void renderArtifact(artifact, async (source) => {
            const { renderDiagram } = await import('./mermaid');
            return renderDiagram(source, card.current!, mode === 'dark');
        }).then((state) => {
            if (!cancelled) setDrawing(state);
        });
        return () => {
            cancelled = true;
        };
    }, [artifact.id, artifact.status, artifact.source, mode, name, renderAttempt]);
    // A successful Retry removes its button; keep keyboard focus on the card rather than dropping it to the page.
    useEffect(() => {
        if (retried && drawing.status === 'ready' && document.activeElement === document.body)
            card.current?.focus();
    }, [retried, drawing.status]);
    const failed = drawing.status === 'failed';
    const showSource = sourceShown ?? failed;
    const step = steps.indexOf(artifact);
    // Each step is its own card; Previous and Next move focus to the neighbouring step's card.
    const goTo = (i: number) => {
        const next = card.current?.ownerDocument.querySelector<HTMLElement>(
            `[data-artifact="${steps[i].id}"]`,
        );
        next?.scrollIntoView?.({ block: 'nearest' });
        next?.focus();
    };
    return (
        <section
            ref={card}
            className="diagram-card"
            tabIndex={0}
            aria-labelledby={steps.length > 1 ? `${id}-step ${id}-title` : `${id}-title`}
            aria-describedby={`${id}-description`}
            data-artifact={artifact.id}
            data-state={drawing.status}
        >
            <HStack gap={2} vAlign="center" className="diagram-head">
                <Heading level={3} id={`${id}-title`}>
                    {figure ? `Fig ${figure} · ` : ''}
                    {artifact.title}
                </Heading>
                <HStack vAlign="center" className="diagram-tools">
                    {steps.length > 1 && (
                        <>
                            <IconButton
                                label="Previous step"
                                icon={<ChevronLeftIcon />}
                                variant="ghost"
                                size="sm"
                                isDisabled={step < 1}
                                onClick={() => goTo(step - 1)}
                            />
                            <Text type="supporting" color="secondary" id={`${id}-step`}>
                                Step {step + 1} of {steps.length}
                            </Text>
                            <IconButton
                                label="Next step"
                                icon={<ChevronRightIcon />}
                                variant="ghost"
                                size="sm"
                                isDisabled={step >= steps.length - 1}
                                onClick={() => goTo(step + 1)}
                            />
                        </>
                    )}
                    {artifact.source && (
                        <IconButton
                            label="Mermaid source"
                            icon={<CodeBracketIcon />}
                            variant="ghost"
                            size="sm"
                            aria-expanded={showSource}
                            aria-controls={`${id}-source`}
                            onClick={() => setSourceShown(!showSource)}
                        />
                    )}
                    {drawing.status === 'ready' && (
                        <IconButton
                            label={`Open diagram large: ${artifact.title}`}
                            tooltip="Open large"
                            icon={<ArrowsPointingOutIcon />}
                            variant="ghost"
                            size="sm"
                            onClick={() => setEnlarged(true)}
                        />
                    )}
                </HStack>
            </HStack>
            <VStack gap={2} className="diagram-body">
                {drawing.status === 'pending' && (
                    <Text type="supporting" color="secondary" role="status">
                        {artifact.status === 'pending' ? 'Creating diagram…' : 'Rendering diagram…'}
                    </Text>
                )}
                {failed && (
                    <Text type="supporting" role="status">
                        {artifact.status === 'failed'
                            ? `Diagram unavailable. ${artifact.error ?? ''}`
                            : 'Diagram could not be rendered. Read the description and Mermaid source below.'}
                    </Text>
                )}
                {(failed || (retried && drawing.status === 'pending')) && (
                    <HStack>
                        <Button
                            key="retry"
                            label="Retry diagram"
                            variant="secondary"
                            size="sm"
                            isLoading={drawing.status === 'pending'}
                            isDisabled={artifact.status === 'failed' && !onRetry}
                            clickAction={async () => {
                                setRetried(true);
                                if (artifact.status === 'failed') await onRetry?.();
                                else setRenderAttempt((n) => n + 1);
                            }}
                        />
                    </HStack>
                )}
                {drawing.status === 'ready' && (
                    <>
                        <img
                            className="diagram-drawing"
                            src={drawing.url}
                            alt={artifact.description}
                            onError={() => setDrawing({ status: 'failed' })}
                        />
                        <Lightbox
                            className="diagram-lightbox"
                            isOpen={enlarged}
                            onOpenChange={setEnlarged}
                            hasZoom
                            media={{ src: drawing.url, alt: artifact.description }}
                        />
                    </>
                )}
                <Text
                    type="supporting"
                    color="secondary"
                    className="diagram-caption"
                    id={`${id}-description`}
                >
                    {artifact.description}
                </Text>
                {artifact.source && showSource && (
                    <pre className="diagram-source" id={`${id}-source`} tabIndex={0}>
                        {artifact.source}
                    </pre>
                )}
            </VStack>
        </section>
    );
}
