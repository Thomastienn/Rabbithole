import { useEffect, useId, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { renderArtifact, type Artifact, type DiagramState } from './artifacts';

export default function DiagramCard({ artifact }: { artifact: Artifact }) {
  const id = useId();
  const card = useRef<HTMLElement>(null);
  const [drawing, setDrawing] = useState<DiagramState>({ status: 'pending' });
  const [scheme, setScheme] = useState(0);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setScheme(s => s + 1);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setDrawing({ status: 'pending' });
    void renderArtifact(artifact, async source => {
      const { renderDiagram } = await import('./mermaid');
      return renderDiagram(source, getComputedStyle(card.current!));
    }).then(state => { if (!cancelled) setDrawing(state); });
    return () => { cancelled = true; };
  }, [artifact.id, artifact.status, artifact.source, scheme]);
  const failed = drawing.status === 'failed';
  return <section ref={card} className="diagram-card" tabIndex={0} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} data-artifact={artifact.id} data-state={drawing.status}>
    <VStack gap={3} padding={3}>
      <Heading level={3} id={`${id}-title`}>{artifact.title}</Heading>
      <Text id={`${id}-description`}>{artifact.description}</Text>
      {drawing.status === 'pending' && <Text type="supporting" color="secondary" role="status">{artifact.status === 'pending' ? 'Creating diagram…' : 'Rendering diagram…'}</Text>}
      {failed && <Text type="supporting" role="status">{artifact.status === 'failed' ? `Diagram unavailable. ${artifact.error ?? ''}` : 'Diagram could not be rendered. Read the description and Mermaid source below.'}</Text>}
      {drawing.status === 'ready' && <section className="diagram-viewport" tabIndex={0} aria-label={`Diagram drawing: ${artifact.title}`}><img src={drawing.url} alt={artifact.description} onError={() => setDrawing({ status: 'failed' })} /></section>}
      {artifact.source && <Collapsible key={failed ? 'fallback' : 'source'} trigger="Mermaid source" defaultIsOpen={failed}><pre className="diagram-source" tabIndex={0}>{artifact.source}</pre></Collapsible>}
    </VStack>
  </section>;
}
