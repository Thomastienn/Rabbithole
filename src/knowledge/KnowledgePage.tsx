import { VStack } from '@astryxdesign/core/Layout';
import { useKnowledge } from './useKnowledge';
import { KnowledgeHeader, KnowledgeMerge } from './KnowledgeControls';
import KnowledgeMap from './KnowledgeMap';
export type { Graph } from './knowledge';

export default function KnowledgePage({ activity }: { activity: string }) {
    const knowledge = useKnowledge({ activity });
    return (
        <VStack gap={5} className="knowledge-content">
            <KnowledgeHeader {...knowledge} />
            <KnowledgeMap {...knowledge} />
            <KnowledgeMerge {...knowledge} />
        </VStack>
    );
}
