import { useEffect, useId, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Lightbox } from '@astryxdesign/core/Lightbox';
import { useTheme } from '@astryxdesign/core/theme';
import { renderArtifact, type Artifact, type DiagramState } from './artifacts';

export default function DiagramCard({ artifact }: { artifact: Artifact }) {
  const id = useId();
  const card = useRef<HTMLElement>(null);
  const [drawing, setDrawing] = useState<DiagramState>({ status: 'pending' });
  const { mode } = useTheme();
  const [enlarged, setEnlarged] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setDrawing({ status: 'pending' });
    void renderArtifact(artifact, async source => {
      const { renderDiagram } = await import('./mermaid');
      return renderDiagram(source, card.current!, mode === 'dark');
    }).then(state => { if (!cancelled) setDrawing(state); });
    return () => { cancelled = true; };
  }, [artifact.id, artifact.status, artifact.source, mode]);
  const failed = drawing.status === 'failed';
  return <section ref={card} className="diagram-card" tabIndex={0} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} data-artifact={artifact.id} data-state={drawing.status}>
    <VStack gap={3} padding={3}>
      <Heading level={3} id={`${id}-title`}>{artifact.title}</Heading>
      <Text id={`${id}-description`}>{artifact.description}</Text>
      {drawing.status === 'pending' && <Text type="supporting" color="secondary" role="status">{artifact.status === 'pending' ? 'Creating diagram…' : 'Rendering diagram…'}</Text>}
      {failed && <Text type="supporting" role="status">{artifact.status === 'failed' ? `Diagram unavailable. ${artifact.error ?? ''}` : 'Diagram could not be rendered. Read the description and Mermaid source below.'}</Text>}
      {drawing.status === 'ready' && <>
        <button type="button" className="diagram-open" aria-label={`Open diagram large: ${artifact.title}`} onClick={() => setEnlarged(true)}><img src={drawing.url} alt={artifact.description} onError={() => setDrawing({ status: 'failed' })} /></button>
        <Lightbox className="diagram-lightbox" isOpen={enlarged} onOpenChange={setEnlarged} hasZoom media={{ src: drawing.url, alt: artifact.description }} />
      </>}
      {artifact.source && <Collapsible key={failed ? 'fallback' : 'source'} trigger={<Text weight="medium">Mermaid source</Text>} defaultIsOpen={failed}><pre className="diagram-source" tabIndex={0}>{artifact.source}</pre></Collapsible>}
    </VStack>
  </section>;
}
