import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Selector } from '@astryxdesign/core/Selector';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import type { Concept } from './knowledge';
import type { KnowledgeState } from './useKnowledge';

export function KnowledgeHeader({ graph, error, status, busy, merge, load }: KnowledgeState) {
  return (
    <VStack gap={2}>
      <HStack gap={4} vAlign="end" wrap="wrap" className="library-head">
        <VStack gap={2}>
          <Heading level={1}>Knowledge</Heading>
          <Text color="secondary" className="library-intro">
            Concepts from all your learning trees. Familiarity is an estimate, not measured mastery.
            Your corrections take precedence.
          </Text>
        </VStack>
        <Button
          label="Refresh Knowledge"
          variant="secondary"
          icon={<ArrowPathIcon />}
          isDisabled={busy}
          onClick={() => void load()}
        />
      </HStack>
      <Text role="status">{status}</Text>
      {error && !merge && <Text role="alert">{error}</Text>}
      {!graph && !error && <Text role="status">Loading knowledge…</Text>}
      {graph && !graph.concepts.length && (
        <Text>
          No concepts yet. Concepts appear here after suggestions find them in a saved tutor reply.
        </Text>
      )}
    </VStack>
  );
}

export function KnowledgeActions({
  selected,
  graph,
  busy,
  correct,
  beginMerge,
}: KnowledgeState & { selected: Concept }) {
  return (
    <HStack
      gap={2}
      wrap="wrap"
      role="group"
      aria-label={`Corrections for ${selected.name}`}
      className="knowledge-actions"
    >
      <Button
        label="I know this"
        size="sm"
        variant="secondary"
        aria-pressed={selected.correction === 'known'}
        isDisabled={busy}
        onClick={() => void correct(selected.name, 'known')}
      />
      <Button
        label="I don't get this"
        size="sm"
        variant="secondary"
        aria-pressed={selected.correction === 'unknown'}
        isDisabled={busy}
        onClick={() => void correct(selected.name, 'unknown')}
      />
      <Button
        label={`Merge ${selected.name}…`}
        size="sm"
        variant="ghost"
        isDisabled={busy || graph!.concepts.length < 2}
        onClick={(e) => beginMerge(selected.name, e.currentTarget)}
      >
        Merge…
      </Button>
    </HStack>
  );
}

export function KnowledgeMerge({
  merge,
  closeMerge,
  busy,
  submitMerge,
  graph,
  into,
  setInto,
  error,
}: KnowledgeState) {
  return (
    <Dialog
      className="merge-dialog"
      isOpen={!!merge}
      onOpenChange={(open) => {
        if (!open) closeMerge();
      }}
      purpose={busy ? 'required' : 'form'}
      width="32rem"
    >
      <DialogHeader title="Merge duplicate concepts" />
      <form onSubmit={submitMerge}>
        <VStack padding={5} gap={4}>
          <Text>
            Merge “{merge}” into another concept. Keep the chosen name and combine topics, evidence
            and links. The latest correction from either concept takes precedence. This cannot be
            undone.
          </Text>
          <Selector
            label="Concept to keep"
            placeholder="Choose the duplicate concept"
            options={graph?.concepts.filter((c) => c.name !== merge).map((c) => c.name) ?? []}
            value={into}
            onChange={setInto}
            hasSearch
            isDisabled={busy}
            width="100%"
          />
          {error && <Text role="alert">{error}</Text>}
          <HStack gap={2} wrap="wrap">
            <Button
              label={busy ? 'Merging…' : 'Merge concepts'}
              type="submit"
              isDisabled={busy || !into}
            />
            <Button label="Cancel merge" variant="ghost" isDisabled={busy} onClick={closeMerge} />
          </HStack>
        </VStack>
      </form>
    </Dialog>
  );
}
