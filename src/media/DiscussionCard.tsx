import { useState } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import {
  ChatMessage,
  ChatMessageBubble,
  ChatComposer,
  ChatComposerInput,
} from '@astryxdesign/core/Chat';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Heading, Text } from '@astryxdesign/core/Text';
import {
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  ArrowUpIcon,
} from '@heroicons/react/24/outline';
import type { Artifact, DiscussionReply } from './artifacts';

export default function DiscussionCard({
  artifact,
  onReply,
}: {
  artifact: Artifact;
  onReply?: DiscussionReply;
}) {
  const [draft, setDraft] = useState(''),
    [sending, setSending] = useState(false),
    [optimistic, setOptimistic] = useState<{ text: string; from: number }>(),
    [error, setError] = useState('');
  const discussion = artifact.discussion;
  const closed = !!discussion?.closed,
    busy = !closed && (sending || discussion?.turn?.status === 'streaming');
  const lines = discussion
    ? [
        ...discussion.lines,
        ...(optimistic && optimistic.from === discussion.lines.length
          ? [{ speaker: 'Learner', text: optimistic.text }]
          : []),
      ]
    : [];
  const failed = sending ? '' : error || artifact.error;
  async function submit(text: string) {
    if (!onReply || !text.trim() || busy || closed || !discussion) return;
    setSending(true);
    setOptimistic({ text: text.trim(), from: discussion.lines.length });
    setDraft('');
    setError('');
    try {
      await onReply(artifact, text.trim());
    } catch (e) {
      setError((e as Error).message);
      setDraft(text);
    } finally {
      setSending(false);
      setOptimistic(undefined);
    }
  }
  const pending = artifact.status === 'pending';
  const ready = artifact.status === 'ready' && !!discussion;
  const names = discussion
    ? [
        ...new Set([
          ...discussion.lines
            .map((l) => l.speaker)
            .filter((s) => discussion.classmates.includes(s)),
          ...discussion.classmates,
        ]),
      ]
    : [];
  const joined = names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
  const title = pending
    ? 'Starting a discussion…'
    : ready
      ? `Discussion with ${joined}`
      : 'Discussion unavailable';
  const Icon = pending || ready ? ChatBubbleLeftRightIcon : ExclamationTriangleIcon;
  return (
    <section
      className="discussion-card"
      tabIndex={-1}
      data-artifact={artifact.id}
      data-state={artifact.status}
      aria-label={title + (closed ? ', closed' : '')}
      aria-busy={busy || undefined}
    >
      <header className="discussion-card__head">
        <Icon aria-hidden />
        <Heading level={3} className="discussion-card__title" role={pending ? 'status' : undefined}>
          {title}
        </Heading>
        {ready && (
          <Text
            type="supporting"
            color={closed ? 'secondary' : 'accent'}
            className="discussion-card__count"
          >
            {closed ? 'Closed' : 'Open'}
          </Text>
        )}
      </header>
      {pending ? (
        <div className="discussion-card__skeleton" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={14} index={i} />
          ))}
        </div>
      ) : ready ? (
        <>
          <ol className="discussion-card__lines" aria-label="Discussion lines">
            {lines.map((line, index) => (
              <li key={index}>
                <ChatMessage
                  sender={line.speaker === 'Learner' ? 'user' : 'assistant'}
                  density="compact"
                  className="discussion-card__line"
                  data-speaker={
                    line.speaker === 'Learner'
                      ? 'learner'
                      : line.speaker === 'Tutor'
                        ? 'tutor'
                        : 'classmate'
                  }
                  name={
                    line.speaker !== 'Learner' && (
                      <Text type="supporting" className="discussion-card__name">
                        {line.speaker}
                      </Text>
                    )
                  }
                  avatar={
                    line.speaker === 'Learner' ? undefined : line.speaker === 'Tutor' ? (
                      <span
                        className="discussion-card__avatar discussion-card__avatar--tutor"
                        aria-hidden
                      >
                        <SparklesIcon />
                      </span>
                    ) : (
                      <Avatar
                        className="discussion-card__avatar"
                        name={line.speaker.slice(0, 1)}
                        size="sm"
                        tooltip={false}
                        aria-hidden
                      />
                    )
                  }
                >
                  {line.speaker === 'Learner' ? (
                    <ChatMessageBubble variant="ghost" className="question-bubble">
                      <Text>{line.text}</Text>
                    </ChatMessageBubble>
                  ) : (
                    <Text
                      className="discussion-card__text"
                      data-streaming={
                        (busy &&
                          index === lines.length - 1 &&
                          discussion.turn &&
                          index >= discussion.turn.start) ||
                        undefined
                      }
                    >
                      {line.text}
                    </Text>
                  )}
                </ChatMessage>
              </li>
            ))}
          </ol>
          {busy &&
            (optimistic?.from === discussion.lines.length ||
              !discussion.turn ||
              lines.length <= discussion.turn.start) && (
              <Text role="status" className="discussion-card__busy">
                Discussion continuing…
              </Text>
            )}
          {failed && (
            <Text role="alert" className="discussion-card__failure">
              <ExclamationTriangleIcon aria-hidden />
              The discussion could not continue: {failed.replace(/[.!]$/, '')}. Send your reply
              again to retry.
            </Text>
          )}
          {closed ? (
            <Text type="supporting" color="secondary" className="discussion-card__closed">
              Closed when you asked in the conversation. You can still read it and branch from any
              line.
            </Text>
          ) : (
            <div className="discussion-card__reply">
              <ChatComposer
                value={draft}
                onChange={setDraft}
                onSubmit={(text) => void submit(text)}
                isDisabled={busy}
                density="compact"
                elevation="none"
                input={
                  <ChatComposerInput
                    label="Reply in the discussion"
                    placeholder={`Reply to ${joined}`}
                    maxRows={4}
                    hasHistory={false}
                    pasteAsToken={false}
                  />
                }
                sendButton={
                  <IconButton
                    icon={<ArrowUpIcon />}
                    label="Send to the discussion"
                    variant="primary"
                    size="sm"
                    isDisabled={busy || !draft.trim() || !onReply}
                    onClick={() => void submit(draft)}
                  />
                }
              />
              <Text type="supporting" color="secondary">
                Enter to send · Asking in the conversation closes this discussion
              </Text>
            </div>
          )}
        </>
      ) : (
        <Text type="supporting" color="secondary" className="discussion-card__error">
          The tutor's discussion could not be read. Ask for it again in the conversation.
        </Text>
      )}
    </section>
  );
}
