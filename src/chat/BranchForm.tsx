import { useEffect, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Button } from '@astryxdesign/core/Button';
import ArrowUpIcon from '@heroicons/react/24/outline/ArrowUpIcon';
import type { Anchor } from './branch';

export default function BranchForm({
  branch,
  branching,
  active,
  submit,
  close,
  setQuestion,
  explain,
}: {
  branch: { parent: string; anchor: Anchor; question: string };
  branching: boolean;
  active: boolean;
  submit: (e: React.FormEvent) => void;
  close: (refocus: boolean) => void;
  setQuestion: (question: string) => void;
  explain?: (anchor: Anchor) => Promise<string>;
}) {
  const { anchor } = branch;
  // Only an unexplored suggestion in a reply asks for its brief explanation on opening.
  const auto = !!explain && anchor.suggestion === true && anchor.artifactId === undefined;
  const [brief, setBrief] = useState<{ attempt: number; text?: string; failed?: string }>({
    attempt: 0,
  });
  const briefKey =
    auto && JSON.stringify([branch.parent, anchor.messageId, anchor.start, anchor.end]);
  useEffect(() => {
    if (!briefKey) return;
    let live = true;
    setBrief((b) => ({ attempt: b.attempt }));
    explain!(anchor).then(
      (text) => live && setBrief((b) => ({ attempt: b.attempt, text })),
      (e: Error) => live && setBrief((b) => ({ attempt: b.attempt, failed: e.message })),
    );
    return () => {
      live = false;
    };
  }, [briefKey, brief.attempt]);
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
        {briefKey &&
          (brief.text ? (
            <Text className="branch-brief">{brief.text}</Text>
          ) : brief.failed ? (
            <HStack gap={1} vAlign="center" role="alert">
              <Text className="branch-brief">{brief.failed}</Text>
              <Button
                label="Retry"
                size="sm"
                variant="ghost"
                onClick={() => setBrief((b) => ({ attempt: b.attempt + 1 }))}
              />
            </HStack>
          ) : (
            <Text className="branch-brief" role="status">
              Writing a brief explanation…
            </Text>
          ))}
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
