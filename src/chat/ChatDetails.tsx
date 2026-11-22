import type { RefObject } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { IconButton } from '@astryxdesign/core/IconButton';
import ChartBarIcon from '@heroicons/react/24/outline/ChartBarIcon';
import ExclamationTriangleIcon from '@heroicons/react/24/outline/ExclamationTriangleIcon';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Token } from '@astryxdesign/core/Token';
import { Skeleton } from '@astryxdesign/core/Skeleton';
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
                            (m) =>
                                m.role === 'assistant' &&
                                (m.status === 'completed' || m.mediaUsage?.length),
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
                        (m) =>
                            m.role === 'assistant' &&
                            (m.status === 'completed' || m.mediaUsage?.length),
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
}: {
    branch: Branch | null;
    parentTitle: string;
}) {
    return (
        <>
            {branch && (
                <Collapsible
                    className="inherited-context"
                    defaultIsOpen={false}
                    trigger={<Text weight="medium">Inherited from {parentTitle}</Text>}
                >
                    <dl className="inherited-body">
                        {branch.text && (
                            <>
                                <dt>
                                    {branch.speaker
                                        ? `Passage, from ${branch.speaker} in the discussion`
                                        : 'Passage'}
                                </dt>
                                <dd>{branch.text}</dd>
                            </>
                        )}
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
                    {message.status === 'failed' && (
                        <ExclamationTriangleIcon className="reply-failed-icon" aria-hidden />
                    )}
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
            {/* Sized skeleton lines hold the reply's place until its first words arrive. */}
            {!overview && message.status === 'streaming' && !message.text && (
                <VStack gap={2} className="reply-skeleton" aria-hidden>
                    <Skeleton height={12} width="92%" />
                    <Skeleton height={12} width="78%" />
                    <Skeleton height={12} width="55%" />
                </VStack>
            )}
        </>
    );
}

// Next questions under the latest reply; choosing one asks it in this conversation.
// Shown above the reply so the learner sees missing background before reading.
// Choosing a chip creates its child at once; an explored chip carries its child's address and ink and opens it.
export function Groundwork({
    suggestions,
    explored = [],
    choose,
}: {
    suggestions?: Suggestions;
    explored?: { concept: string; address?: string; ink?: number }[];
    choose: (concept: string) => void;
}) {
    // The tutor's groundwork shows as the reply begins.
    if (suggestions?.status === 'failed' || !suggestions?.groundwork?.length) return null;
    return (
        <HStack gap={1} className="groundwork" role="group" aria-label="Groundwork">
            {suggestions.groundwork.map((concept) => {
                const child = explored.find((b) => b.concept === concept);
                return (
                    <Token
                        key={concept}
                        label={concept}
                        size="sm"
                        description={
                            child
                                ? `Explored. Opens its chat${child.address ? `, ${child.address}` : ''}`
                                : `Ask what ${concept} is in a new chat`
                        }
                        endContent={child?.address}
                        data-explored={child ? '' : undefined}
                        style={child ? inkStyle(child.ink ?? 0) : undefined}
                        onClick={() => choose(concept)}
                    />
                );
            })}
        </HStack>
    );
}

// Free branches asked after this reply, in address order: each child's address chip in family ink, then its title.
export function FreeBranches({
    branches,
    open,
}: {
    branches: { child: string; title: string; address?: string; ink?: number }[];
    open: (id: string) => void;
}) {
    if (!branches.length) return null;
    return (
        <HStack
            gap={1}
            vAlign="center"
            wrap="wrap"
            className="free-branches"
            role="group"
            aria-label="Asked on the side after this reply"
        >
            <span className="origin-ring" aria-hidden />
            {branches.map((b) => (
                <Button
                    key={b.child}
                    label={b.title}
                    aria-label={`Open ${[b.address, b.title].filter(Boolean).join(' ')}`}
                    variant="secondary"
                    size="sm"
                    icon={
                        <span className="address-chip" style={inkStyle(b.ink ?? 0)}>
                            {b.address}
                        </span>
                    }
                    onClick={() => open(b.child)}
                />
            ))}
        </HStack>
    );
}

export function NextQuestions({
    message,
    latest,
    overview,
    active,
    ask,
}: {
    message: Message;
    latest: boolean;
    overview: boolean;
    active: boolean;
    ask: (question: string) => void;
}) {
    if (overview || !latest || message.role !== 'assistant' || !message.questions?.length)
        return null;
    return (
        <VStack
            gap={1}
            hAlign="start"
            className="next-questions"
            role="group"
            aria-label="Next questions"
        >
            {message.questions.map((question) => (
                <Button
                    key={question}
                    label={question}
                    variant="secondary"
                    size="sm"
                    isDisabled={active}
                    onClick={() => ask(question)}
                />
            ))}
        </VStack>
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
