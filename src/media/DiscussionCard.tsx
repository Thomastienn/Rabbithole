import { Avatar } from '@astryxdesign/core/Avatar';
import { ChatMessage } from '@astryxdesign/core/Chat';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Heading, Text } from '@astryxdesign/core/Text';
import {
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { Artifact } from './artifacts';

export default function DiscussionCard({ artifact }: { artifact: Artifact }) {
  const discussion = artifact.discussion;
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
      aria-label={title}
    >
      <header className="discussion-card__head">
        <Icon aria-hidden />
        <Heading level={3} className="discussion-card__title" role={pending ? 'status' : undefined}>
          {title}
        </Heading>
        {ready && (
          <Text type="supporting" color="secondary" className="discussion-card__count">
            {names.length} classmates
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
        <ol className="discussion-card__lines" aria-label="Discussion lines">
          {discussion.lines.map((line, index) => (
            <li key={index}>
              <ChatMessage
                sender="assistant"
                density="compact"
                className="discussion-card__line"
                data-speaker={line.speaker === 'Tutor' ? 'tutor' : 'classmate'}
                name={
                  <Text type="supporting" className="discussion-card__name">
                    {line.speaker}
                  </Text>
                }
                avatar={
                  line.speaker === 'Tutor' ? (
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
                <Text className="discussion-card__text">{line.text}</Text>
              </ChatMessage>
            </li>
          ))}
        </ol>
      ) : (
        <Text type="supporting" color="secondary" className="discussion-card__error">
          The tutor's discussion could not be read. Ask for it again in the conversation.
        </Text>
      )}
    </section>
  );
}
