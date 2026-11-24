import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import type { KnowledgeState } from './useKnowledge';

export function KnowledgeHeader({ graph, error, load }: KnowledgeState) {
    return (
        <VStack gap={2}>
            <HStack gap={4} vAlign="end" wrap="wrap" className="library-head">
                <VStack gap={2}>
                    <Heading level={1}>Knowledge</Heading>
                    <Text color="secondary" className="library-intro">
                        Concepts you have explored across every tree, grouped by topic. Familiarity
                        is an estimate from what you write, not measured mastery.
                    </Text>
                </VStack>
                <IconButton
                    label="Refresh Knowledge"
                    tooltip="Refresh Knowledge"
                    variant="ghost"
                    icon={<ArrowPathIcon />}
                    onClick={() => void load()}
                />
            </HStack>
            {error && <Text role="alert">{error}</Text>}
            {!graph && !error && <Text role="status">Loading knowledge…</Text>}
            {graph && !graph.concepts.length && (
                <VStack gap={2} className="knowledge-empty">
                    <Heading level={2}>No concepts yet</Heading>
                    <Text color="secondary">
                        Concepts appear here as you explore ideas in your chats.
                    </Text>
                </VStack>
            )}
        </VStack>
    );
}
