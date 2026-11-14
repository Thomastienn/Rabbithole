import { useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { IconButton } from '@astryxdesign/core/IconButton';
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import ArrowUpIcon from '@heroicons/react/24/outline/ArrowUpIcon';
import EllipsisHorizontalIcon from '@heroicons/react/24/outline/EllipsisHorizontalIcon';
import type { Graph } from '../knowledge/KnowledgePage';
import type { Anchor } from './branch';

function PassageCorrection({
  name,
  api,
  disabled,
  children,
}: {
  name: string;
  api: (path: string, body?: unknown) => Promise<Graph>;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const [correction, setCorrection] = useState<'known' | 'unknown' | null>(null);
  const [saving, setSaving] = useState<'known' | 'unknown'>();
  const [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const version = useRef(0);
  useEffect(() => {
    const current = ++version.current;
    void api('/api/graph')
      .then((graph) => {
        if (current === version.current)
          setCorrection(
            graph.concepts.find((c) => c.name.toLowerCase() === name.toLowerCase())?.correction ??
              null,
          );
      })
      .catch((e) => {
        if (current === version.current) setError(e.message);
      });
    return () => {
      version.current++;
    };
  }, [name]);
  async function correct(kind: 'known' | 'unknown') {
    if (saving || disabled) return;
    version.current++;
    setSaving(kind);
    setError('');
    setStatus('');
    try {
      await api('/api/graph/correct', { name, kind });
      setCorrection(kind);
      setStatus(
        `${name}: ${kind === 'known' ? 'marked as known' : 'marked as not understood'}. Your correction overrides the estimate.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(undefined);
    }
  }
  // Overflow keeps both corrections reachable without two prominent buttons; selecting one saves it.
  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center">
        {children}
        <DropdownMenu
          presentation="popover"
          alignment="end"
          renderTrigger={(props) => (
            <IconButton
              {...props}
              label={`Familiarity options for ${name}`}
              tooltip="Familiarity"
              icon={<EllipsisHorizontalIcon />}
              variant="ghost"
              size="sm"
              isLoading={!!saving}
              isDisabled={disabled}
            />
          )}
        >
          <DropdownMenuRadioGroup
            label={`Corrections for ${name}`}
            value={correction ?? undefined}
            onChange={(kind) => void correct(kind as 'known' | 'unknown')}
          >
            <DropdownMenuRadioItem value="known" label="I know this" />
            <DropdownMenuRadioItem value="unknown" label="I don't get this" />
          </DropdownMenuRadioGroup>
        </DropdownMenu>
      </HStack>
      <Text type="supporting" role="status" className="correction-status">
        {status}
      </Text>
      {error && (
        <Text type="supporting" role="alert">
          {error}
        </Text>
      )}
    </VStack>
  );
}

export default function BranchForm({
  branch,
  branching,
  active,
  concept,
  api,
  submit,
  close,
  setQuestion,
}: {
  branch: { parent: string; anchor: Anchor; question: string };
  branching: boolean;
  active: boolean;
  concept?: string;
  api: (path: string, body?: unknown) => Promise<Graph>;
  submit: (e: React.FormEvent) => void;
  close: (refocus: boolean) => void;
  setQuestion: (question: string) => void;
}) {
  useEffect(() => {
    if (branching) return;
    // Capture phase so the popup closes before a new selection or underline reopens it; its menu popover counts as inside.
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.branch-form, [role=menu]')) close(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [branching]);
  return (
    <form
      className="branch-form"
      onSubmit={submit}
      onKeyDown={(e) => {
        if (
          e.key === 'Escape' &&
          !branching &&
          !(e.target as Element).closest('[role=menu], [aria-expanded=true]')
        ) {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <VStack padding={2} gap={2}>
        {(() => {
          const row = (
            <>
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
            </>
          );
          return concept ? (
            <PassageCorrection
              key={`${branch.parent}:${branch.anchor.messageId}:${branch.anchor.start}:${branch.anchor.end}`}
              name={concept}
              api={api}
              disabled={branching}
            >
              {row}
            </PassageCorrection>
          ) : (
            <HStack gap={1} vAlign="center">
              {row}
            </HStack>
          );
        })()}
      </VStack>
    </form>
  );
}
