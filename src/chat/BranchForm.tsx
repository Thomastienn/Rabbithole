import { Fragment, useEffect, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Button } from '@astryxdesign/core/Button';
import ArrowUpIcon from '@heroicons/react/24/outline/ArrowUpIcon';
import ChevronRightIcon from '@heroicons/react/24/outline/ChevronRightIcon';
import type { Anchor, BranchState } from './branch';
import type { PartNode } from '../media/artifacts';
import { renderInline } from '../markdown/inlineMarkdown';

export default function BranchForm({
    branch,
    branching,
    active,
    submit,
    askHere,
    close,
    setQuestion,
    explain,
    saved,
    widen,
    pick,
}: {
    branch: BranchState;
    branching: boolean;
    active: boolean;
    submit: (e: React.FormEvent) => void;
    // Sends the question as a turn in this conversation; absent while a reply streams, as the composer then only stops.
    askHere?: () => void;
    close: (refocus: boolean) => void;
    setQuestion: (question: string) => void;
    explain?: (anchor: Anchor) => Promise<string>;
    saved?: string;
    widen?: (depth: number) => void;
    pick?: (trail: string[], step: number | null) => void;
}) {
    const { anchor } = branch;
    // A question sent while its reply streams waits for the reply; Escape still drops it.
    const pending = !!branch.pending;
    // A picked visual part, named by its trail.
    const part = 'trail' in anchor && anchor.trail ? anchor : undefined;
    // Reply passages and visual parts can have a brief explanation, discussion lines cannot; only an unexplored
    // suggestion asks on opening, a selection or a part waits for its button. The text tells parts apart.
    const briefKey =
        !!explain &&
        (anchor.artifactId === undefined || 'label' in anchor) &&
        JSON.stringify([branch.parent, anchor.messageId, anchor.start, anchor.end, anchor.text]);
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
    // Keyboard picking: the visual's part tree, the focused part's siblings (level) and its path of indexes.
    const { picker } = branch;
    const [tree, setTree] = useState<{ parts: PartNode[]; step: number | null }>();
    // The focused index among its level, which keeps parts of the same name apart.
    const [last, setLast] = useState(0);
    useEffect(() => {
        if (!picker) return;
        setTree(undefined);
        picker.listen((parts, step) => setTree({ parts, step }));
        return () => picker.show(undefined);
    }, [picker]);
    const trail = (part?.trail ?? []).slice(),
        name = trail.pop(),
        path: number[] = [];
    let level = tree?.parts ?? [];
    for (const n of trail) {
        path.push(level.findIndex((p) => p.name === n));
        level = level[path.at(-1)!]?.parts ?? [];
    }
    const at =
        name === undefined
            ? -1
            : level[last]?.name === name
              ? last
              : level.findIndex((p) => p.name === name);
    const pathKey = JSON.stringify(at < 0 ? [] : [...path, at]);
    useEffect(() => {
        picker?.show(JSON.parse(pathKey));
    }, [pathKey, picker]);
    const choose = (to: number, parent: string[], nodes: PartNode[]) => {
        setLast(to);
        pick?.([...parent, nodes[to].name], tree!.step);
    };
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
                {/* Passage box (mockup States): a picked part's trail; the passage itself is already highlighted, so its quote is for screen readers only. Escape or an outside click closes it. */}
                {/* A picked visual part: its trail, the same crumbs as the conversation path; an earlier part widens the question. */}
                {part ? (
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
                ) : (
                    <Text id="branch-passage" className="branch-passage sr-only">
                        {branch.anchor.text}
                    </Text>
                )}
                {/* The focused part is the source; the frame outlines it, and its name and trail are announced. */}
                {picker && level.length > 0 && (
                    <div
                        role="listbox"
                        tabIndex={0}
                        className="branch-parts"
                        aria-label="Parts of the visual"
                        aria-activedescendant={at < 0 ? undefined : `branch-part-${at}`}
                        onKeyDown={(e) => {
                            const by = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[
                                e.key
                            ];
                            if (by) {
                                e.preventDefault();
                                const to = at < 0 ? (by > 0 ? 0 : level.length - 1) : at + by;
                                choose(Math.min(level.length - 1, Math.max(0, to)), trail, level);
                            } else if (e.key === 'Enter' && at >= 0) {
                                e.preventDefault();
                                if (level[at].parts.length)
                                    choose(0, [...trail, name!], level[at].parts);
                                else
                                    e.currentTarget
                                        .closest('form')
                                        ?.querySelector('input')
                                        ?.focus();
                            }
                        }}
                    >
                        {level.map((p, i) => (
                            <span
                                key={i}
                                id={`branch-part-${i}`}
                                role="option"
                                className="branch-part"
                                aria-selected={i === at}
                                aria-label={
                                    trail.length
                                        ? [p.name, ...[...trail].reverse()].join(', in ')
                                        : undefined
                                }
                                onClick={() => choose(i, trail, level)}
                            >
                                {p.name}
                            </span>
                        ))}
                    </div>
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
                ) : (
                    want && (
                        <Text className="branch-brief" role="status">
                            Writing a brief explanation…
                        </Text>
                    )
                )}
                <HStack gap={1} vAlign="center">
                    <TextInput
                        label={
                            part ? 'Question about this visual part' : 'Question about this passage'
                        }
                        isLabelHidden
                        placeholder={part ? `Ask about ${part.label}` : 'Ask about this passage'}
                        aria-describedby={part ? undefined : 'branch-passage'}
                        value={branch.question}
                        onChange={(question) => setQuestion(question)}
                        isDisabled={branching || pending}
                        hasAutoFocus
                        containerClassName="branch-question"
                    />
                    <IconButton
                        className="branch-send"
                        label="Send"
                        type="submit"
                        icon={<ArrowUpIcon />}
                        variant="primary"
                        isDisabled={branching || pending || !branch.question.trim() || active}
                    />
                </HStack>
                <HStack gap={2} vAlign="center">
                    {/* Explain briefly gives way to the brief once asked; a saved brief needs no button. */}
                    {briefKey && !text && !want && (
                        <Button
                            label="Explain briefly"
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                                // The button gives way to the loading state, so focus moves on to the question box.
                                e.currentTarget.form?.querySelector('input')?.focus();
                                setAsked(briefKey);
                            }}
                        />
                    )}
                    <Button
                        label={
                            branching
                                ? 'Preparing context…'
                                : pending
                                  ? 'Waiting for the reply…'
                                  : 'Ask here'
                        }
                        size="sm"
                        variant="secondary"
                        isLoading={branching || pending}
                        isDisabled={
                            branching || pending || !branch.question.trim() || active || !askHere
                        }
                        onClick={askHere}
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
