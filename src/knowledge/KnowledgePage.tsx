import { VStack } from '@astryxdesign/core/Layout';
import { useKnowledge } from './useKnowledge';
import { KnowledgeHeader } from './KnowledgeControls';
import KnowledgeMap from './KnowledgeMap';
import KnowledgeStats from './KnowledgeStats';
import type { OpenSource } from './ConceptDetail';
export type { Graph } from './knowledge';

// open: shows a source conversation the way the app opens conversations.
export default function KnowledgePage({ activity, open }: { activity: string; open: OpenSource }) {
    const knowledge = useKnowledge({ activity });
    return (
        <VStack gap={0} className="knowledge-content knowledge-page">
            <KnowledgeHeader {...knowledge} />
            <KnowledgeMap {...knowledge} open={open} />
            <KnowledgeStats {...knowledge} />
        </VStack>
    );
}
