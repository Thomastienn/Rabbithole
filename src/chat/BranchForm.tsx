import { useEffect } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { IconButton } from '@astryxdesign/core/IconButton';
import ArrowUpIcon from '@heroicons/react/24/outline/ArrowUpIcon';
import type { Anchor } from './branch';

export default function BranchForm({
  branch,
  branching,
  active,
  submit,
  close,
  setQuestion,
}: {
  branch: { parent: string; anchor: Anchor; question: string };
  branching: boolean;
  active: boolean;
  submit: (e: React.FormEvent) => void;
  close: (refocus: boolean) => void;
  setQuestion: (question: string) => void;
}) {
  useEffect(() => {
    if (branching) return;
    // Capture phase so the popup closes before a new selection or underline reopens it.
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.branch-form')) close(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [branching]);
  return (
    <form
      className="branch-form"
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !branching) {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <VStack padding={2} gap={2}>
        <HStack gap={1} vAlign="center">
          {/* The reply paints the passage; this quote only describes the question for screen readers. */}
          <Text id="branch-passage" className="branch-passage sr-only">
            {branch.anchor.text}
          </Text>
          <TextInput
            label="Question about this passage"
            isLabelHidden
            placeholder="Ask about this passage"
            aria-describedby="branch-passage"
            size="sm"
            value={branch.question}
            onChange={(question) => setQuestion(question)}
            isDisabled={branching}
            hasAutoFocus
            containerClassName="branch-question"
          />
          <IconButton
            className="branch-send"
            label={branching ? 'Preparing context…' : 'Create focused chat'}
            type="submit"
            icon={<ArrowUpIcon />}
            variant="primary"
            size="sm"
            isLoading={branching}
            isDisabled={branching || !branch.question.trim() || active}
          />
        </HStack>
      </VStack>
    </form>
  );
}
