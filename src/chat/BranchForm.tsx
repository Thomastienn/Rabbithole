import { Fragment, useEffect, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Button } from '@astryxdesign/core/Button';
import ArrowUpIcon from '@heroicons/react/24/outline/ArrowUpIcon';
import ChevronRightIcon from '@heroicons/react/24/outline/ChevronRightIcon';
import type { Anchor } from './branch';
import { renderInline } from '../markdown/inlineMarkdown';

export default function BranchForm({
    branch,
    branching,
    active,
    submit,
    close,
    setQuestion,
    explain,
    saved,
    widen,
}: {
    branch: { parent: string; anchor: Anchor; question: string; pending?: boolean };
    branching: boolean;
    active: boolean;
    submit: (e: React.FormEvent) => void;
    close: (refocus: boolean) => void;
    setQuestion: (question: string) => void;
    explain?: (anchor: Anchor) => Promise<string>;
    saved?: string;
    widen?: (depth: number) => void;
}) {
    const { anchor } = branch;
    // A question sent while its reply streams waits for the reply; Escape still drops it.
    const pending = !!branch.pending;
    // A picked visual part, named by its trail.
    const part = 'trail' in anchor && anchor.trail ? anchor : undefined;
    // Reply passages can have a brief explanation; only an unexplored suggestion asks on opening, a selection waits for its button.
    const briefKey =
        !!explain &&
        anchor.artifactId === undefined &&
        JSON.stringify([branch.parent, anchor.messageId, anchor.start, anchor.end]);
    const [asked, setAsked] = useState<string>();
    const [brief, setBrief] = useState<{
        attempt: number;
        key?: string;
        text?: string;
        failed?: string;
    }>({
        attempt: 0,
    });
    const want = !!briefKey && !saved && (anchor.suggestion === true || asked === briefKey);
    useEffect(() => {
        if (!want) return;
        let live = true;
        setBrief((b) => ({ attempt: b.attempt, key: briefKey }));
        explain!(anchor).then(
            (text) => live && setBrief((b) => ({ attempt: b.attempt, key: briefKey, text })),
            (e: Error) =>
                live && setBrief((b) => ({ attempt: b.attempt, key: briefKey, failed: e.message })),
        );
        return () => {
            live = false;
        };
    }, [want, briefKey, brief.attempt]);
    const mine = brief.key === briefKey ? brief : undefined;
    const text = saved ?? mine?.text;
    useEffect(() => {
        // A waiting question survives outside clicks, such as the reply's Stop button.
        if (branching || pending) return;
        // Capture phase so the popup closes before a new selection or underline reopens it.
        const outside = (e: PointerEvent) => {
            if (!(e.target as Element).closest?.('.branch-form')) close(false);
        };
        document.addEventListener('pointerdown', outside, true);
        return () => document.removeEventListener('pointerdown', outside, true);
    }, [branching, pending]);
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
                {/* A picked visual part: its trail, the same crumbs as the conversation path; an earlier part widens the question. */}
                {part && (
                    <nav className="crumbs branch-trail" aria-label="Part of the visual">
                        {part.trail!.slice(0, -1).map((name, i) => (
                            <Fragment key={i}>
                                <Button
                                    className="crumb"
                                    label={name}
                                    variant="ghost"
                                    size="sm"
                                    isDisabled={branching || !widen}
                                    onClick={() => widen?.(i + 1)}
                                />
                                <ChevronRightIcon className="crumb-sep" aria-hidden />
                            </Fragment>
                        ))}
                        <strong aria-current="location">{part.label}</strong>
                    </nav>
                )}
                {text ? (
                    <Text className="branch-brief">{renderInline(text)}</Text>
                ) : want && mine?.failed ? (
                    <HStack gap={1} vAlign="center" role="alert">
                        <Text className="branch-brief">{mine.failed}</Text>
                        <Button
                            label="Retry"
                            size="sm"
                            variant="ghost"
                            onClick={() => setBrief((b) => ({ attempt: b.attempt + 1 }))}
                        />
                    </HStack>
                ) : want ? (
                    <Text className="branch-brief" role="status">
                        Writing a brief explanation…
                    </Text>
                ) : (
                    briefKey && (
                        <HStack>
                            <Button
                                label="Explain briefly"
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                    // The button gives way to the loading state, so focus moves on to the question box.
                                    e.currentTarget.form?.querySelector('input')?.focus();
                                    setAsked(briefKey);
                                }}
                            />
                        </HStack>
                    )
                )}
                <HStack gap={1} vAlign="center">
                    {/* The reply paints the passage; this quote only describes the question for screen readers. */}
                    <Text id="branch-passage" className="branch-passage sr-only">
                        {branch.anchor.text}
                    </Text>
                    <TextInput
                        label={part ? 'Question about this part' : 'Question about this passage'}
                        isLabelHidden
                        placeholder={part ? `Ask about ${part.label}` : 'Ask about this passage'}
                        aria-describedby="branch-passage"
                        size="sm"
                        value={branch.question}
                        onChange={(question) => setQuestion(question)}
                        isDisabled={branching || pending}
                        hasAutoFocus
                        containerClassName="branch-question"
                    />
                    <IconButton
                        className="branch-send"
                        label={
                            branching
                                ? 'Preparing context…'
                                : pending
                                  ? 'Waiting for the reply…'
                                  : 'Create focused chat'
                        }
                        type="submit"
                        icon={<ArrowUpIcon />}
                        variant="primary"
                        size="sm"
                        isLoading={branching || pending}
                        isDisabled={branching || pending || !branch.question.trim() || active}
                    />
                </HStack>
                {pending && (
                    <Text type="supporting" color="secondary" role="status">
                        Sends when the reply finishes.
                    </Text>
                )}
            </VStack>
        </form>
    );
}
