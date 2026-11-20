import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Selector } from '@astryxdesign/core/Selector';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import type { KnowledgeState } from './useKnowledge';

export function KnowledgeHeader({
    graph,
    selected,
    error,
    status,
    busy,
    keep,
    beginMerge,
    load,
}: KnowledgeState) {
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
                <HStack gap={2} vAlign="center">
                    <Button
                        label="Merge concepts"
                        variant="secondary"
                        isDisabled={busy || !selected || graph!.concepts.length < 2}
                        onClick={(e) => beginMerge(selected!.name, e.currentTarget)}
                    />
                    <IconButton
                        label="Refresh Knowledge"
                        tooltip="Refresh Knowledge"
                        variant="ghost"
                        icon={<ArrowPathIcon />}
                        isDisabled={busy}
                        onClick={() => void load()}
                    />
                </HStack>
            </HStack>
            <Text role="status">{status}</Text>
            {error && !keep && <Text role="alert">{error}</Text>}
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

export function KnowledgeMerge({
    keep,
    chooseKeep,
    duplicate,
    setDuplicate,
    closeMerge,
    busy,
    submitMerge,
    graph,
    error,
}: KnowledgeState) {
    const names = graph?.concepts.map((c) => c.name) ?? [];
    return (
        <Dialog
            className="merge-dialog"
            isOpen={!!keep}
            onOpenChange={(open) => {
                if (!open) closeMerge();
            }}
            purpose={busy ? 'required' : 'form'}
            width="29rem"
        >
            <DialogHeader title="Merge duplicate concepts" />
            <form onSubmit={submitMerge}>
                <VStack padding={5} gap={4}>
                    <Text color="secondary">
                        Everything recorded for the duplicate moves to the concept you keep: topics,
                        observations and links. This cannot be undone.
                    </Text>
                    <Selector
                        label="Concept to keep"
                        options={names}
                        value={keep ?? ''}
                        onChange={chooseKeep}
                        hasSearch
                        isDisabled={busy}
                        width="100%"
                    />
                    <Selector
                        label="Duplicate"
                        placeholder="Choose the duplicate concept"
                        options={names.filter((n) => n !== keep)}
                        value={duplicate}
                        onChange={setDuplicate}
                        hasSearch
                        isDisabled={busy}
                        width="100%"
                    />
                    {error && <Text role="alert">{error}</Text>}
                    <HStack gap={2} wrap="wrap" hAlign="between">
                        <Button
                            label="Cancel merge"
                            variant="ghost"
                            isDisabled={busy}
                            onClick={closeMerge}
                        />
                        <Button
                            label={busy ? 'Merging…' : 'Merge concepts'}
                            type="submit"
                            isDisabled={busy || !duplicate}
                        />
                    </HStack>
                </VStack>
            </form>
        </Dialog>
    );
}
