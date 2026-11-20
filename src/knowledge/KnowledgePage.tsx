import { VStack } from '@astryxdesign/core/Layout';
import { useKnowledge } from './useKnowledge';
import { KnowledgeHeader, KnowledgeMerge } from './KnowledgeControls';
import KnowledgeMap from './KnowledgeMap';
import type { Graph } from './knowledge';
export type { Graph } from './knowledge';
type Api = (path: string, body?: unknown) => Promise<Graph>;

export default function KnowledgePage({ api, activity }: { api: Api; activity: string }) {
    const knowledge = useKnowledge({ api, activity });
    return (
        <VStack gap={5} className="knowledge-content">
            <KnowledgeHeader {...knowledge} />
            <KnowledgeMap {...knowledge} />
            <KnowledgeMerge {...knowledge} />
        </VStack>
    );
}
