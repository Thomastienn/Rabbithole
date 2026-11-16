import type { RefObject } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { IconButton } from '@astryxdesign/core/IconButton';
import ChartBarIcon from '@heroicons/react/24/outline/ChartBarIcon';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { inkStyle } from '../map/treeList';
import {
  replyFeedback,
  replyUsageLine,
  conversationUsageLine,
  type Message,
  type Suggestions,
} from './turn';
import type { Branch } from './branch';

export function TokenStats({
  open,
  panel,
  messages,
  suggestions,
}: {
  open: boolean;
  panel?: RefObject<HTMLDivElement | null>;
  messages: Message[];
  suggestions?: Suggestions[];
}) {
  return (
    <>
      {open && (
        <VStack
          ref={panel}
          gap={1}
          className="chat-stats-body"
          role="region"
          aria-label="Token stats"
        >
          {messages
            .filter(
              (m) => m.role === 'assistant' && (m.status === 'completed' || m.mediaUsage?.length),
            )
            .map((m, i) => (
              <Text key={m.id} type="supporting" color="secondary">
                Reply {i + 1}:{' '}
                {replyUsageLine(
                  m.usage ?? null,
                  suggestions?.find((s) => s.message === m.id)?.usage,
                  m.mediaUsage,
                )}
              </Text>
            ))}
          {messages.some(
            (m) => m.role === 'assistant' && (m.status === 'completed' || m.mediaUsage?.length),
          ) ? (
            <Text type="supporting" color="secondary">
              Conversation total: {conversationUsageLine(messages, suggestions)}
            </Text>
          ) : (
            <Text type="supporting" color="secondary">
              Token usage appears after a completed reply.
            </Text>
          )}
        </VStack>
      )}
    </>
  );
}

export function InheritedContext({
  branch,
  parentTitle,
  ink,
}: {
  branch: Branch | null;
  parentTitle: string;
  ink: number;
}) {
  return (
    <>
      {branch && (
        <Collapsible
          style={inkStyle(ink)}
          className="inherited-context"
          defaultIsOpen={false}
          trigger={<Text weight="medium">Inherited from {parentTitle}</Text>}
        >
          <dl className="inherited-body">
            <dt>
              {branch.speaker ? `Passage, from ${branch.speaker} in the discussion` : 'Passage'}
            </dt>
            <dd>{branch.text}</dd>
            {branch.discussion && (
              <>
                <dt>The discussion</dt>
                <dd className="inherited-discussion">{branch.discussion}</dd>
              </>
            )}
            <dt>Your question</dt>
            <dd>{branch.question}</dd>
            <dt>Context the tutor received</dt>
            <dd>{branch.snapshot}</dd>
          </dl>
        </Collapsible>
      )}
    </>
  );
}

export function ReplyFeedback({
  message,
  suggestions,
  overview,
  active,
  latest,
  previous,
  compactionError,
  retry,
}: {
  message: Message;
  suggestions?: Suggestions;
  overview: boolean;
  active: boolean;
  latest: boolean;
  previous?: Message;
  compactionError?: string;
  retry: (text: string) => void;
}) {
  const feedback = replyFeedback(message, previous, latest, active, overview, compactionError);
  return (
    <>
      {!overview &&
        message.role === 'assistant' &&
        message.status === 'completed' &&
        suggestions?.status === 'failed' && (
          <Text type="supporting" color="secondary">
            Suggestions unavailable
          </Text>
        )}
      {message.status !== 'completed' && (
        <HStack
          gap={2}
          vAlign="center"
          className={message.status === 'failed' ? 'failure-banner' : undefined}
        >
          <Text
            type="supporting"
            role="status"
            className="reply-status"
            data-status={message.status}
          >
            {feedback.label}
          </Text>
          {feedback.retry && (
            <Button
              label="Retry reply"
              variant="secondary"
              size="sm"
              onClick={() => retry(previous!.text)}
            />
          )}
        </HStack>
      )}
    </>
  );
}

export function TokenStatsToggle({ open, toggle }: { open: boolean; toggle: () => void }) {
  return (
    <IconButton
      className="stats-toggle"
      label="Token stats"
      tooltip={open ? 'Hide token stats' : 'Show token stats'}
      aria-pressed={open}
      icon={<ChartBarIcon />}
      variant="ghost"
      size="sm"
      onClick={toggle}
    />
  );
}
