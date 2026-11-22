import { useMemo } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ArrowUpIcon } from '@heroicons/react/24/outline';
import {
    ChatComposer,
    ChatComposerInput,
    ChatLayout,
    ChatMessageList,
} from '@astryxdesign/core/Chat';
import type { Summary } from '../map/TreeOverview';
import { TokenStats, InheritedContext } from './ChatDetails';
import TurnRail from './TurnRail';
import { inkStyle } from '../map/treeList';
import OriginStrip from './OriginStrip';
import TitleEditor from './TitleEditor';
import ChatHeadingRow from './ChatHeader';
import ChatThread from './ChatThread';
import {
    AttachButton,
    PendingAttachments,
    noModelNote,
    pendingPlaceholder,
    useAttach,
} from './Attachments';
import type { Tree } from './types';
import type { ChatState } from './useChatState';
import type { ChatModel } from './useChatModel';
import type { LearningTrees } from './useLearningTrees';
import type { ReplyStream } from './useReplyStream';
import type { BranchFormState } from './useBranchForm';
import type { TreeActions } from './useTreeActions';

// The open conversation: header notices, composer, title, details, the thread and the turn rail.
export default function FocusedChat(props: {
    tree: Tree;
    c: ChatState;
    model: ChatModel;
    trees: LearningTrees;
    stream: ReplyStream;
    branchForm: BranchFormState;
    actions: TreeActions;
    active: boolean;
    modelMenu: React.ReactNode;
}) {
    const { tree, c, model, trees, stream, actions, active, modelMenu } = props;
    const { state, addresses, overview, reveal, drafts, setDrafts, renaming, setRenaming } = c;
    const { expanded, toggleExpanded, returnToTree, statsOpen, setStatsOpen, statsPanel } = c;
    const { mobile, transitionBox, composer, setMessageTarget, pendingFiles, setPendingFiles } = c;
    const files = pendingFiles[tree.id] ?? [];
    const setFiles = (next: File[]) => setPendingFiles((p) => ({ ...p, [tree.id]: next }));
    const { modelNotice, unavailableSelection, codexFallback, modelError, models, loadModels } =
        model;
    const attach = useAttach(files, setFiles, active || (!!models && !models.length));
    const { openConversation } = trees;
    const { send } = stream;
    const { rename, finishRename } = actions;
    const ancestors: Summary[] = [];
    for (let id = tree?.branch?.parent; id;) {
        const parent = state?.trees.find((t) => t.id === id);
        if (!parent) break;
        ancestors.unshift(parent);
        id = parent.parent ?? undefined;
    }
    // Ask on the side needs a finished reply to inherit, a typed question and no files; before the first reply it is not drawn.
    const draft = (drafts[tree.id] ?? '').trim();
    const replied = tree.messages.some((m) => m.role === 'assistant' && m.status === 'completed');
    const sideBlocked = active
        ? 'Wait for the reply to finish'
        : files.length
          ? 'A side question carries no files. Remove them to ask on the side.'
          : !draft
            ? 'Type a question to ask it on the side'
            : models && !models.length
              ? 'Sign in to a provider to ask'
              : undefined;
    const source = !overview && reveal?.tree === tree?.id ? reveal?.source : undefined;
    const validSource =
        source &&
        tree?.messages.some(
            (m) =>
                m.id === source.messageId &&
                m.role === 'assistant' &&
                m.status === 'completed' &&
                (source.artifactId !== undefined
                    ? tree.artifacts.some(
                          (a) =>
                              a.id === source.artifactId &&
                              a.message === m.id &&
                              a.kind === 'visual' &&
                              a.status === 'ready',
                      )
                    : source.start >= 0 &&
                      source.end > source.start &&
                      m.text.slice(source.start, source.end) === source.text),
        );
    // Keyed on ids so streaming text does not rebuild the rail's scroll listener.
    const questionIds =
        tree?.messages
            .filter((m) => m.role === 'user')
            .map((m) => m.id)
            .join(' ') ?? '';
    const questions = useMemo(
        () =>
            tree?.messages
                .filter((m) => m.role === 'user')
                .map((m) => ({ id: m.id, text: m.text })) ?? [],
        [tree?.id, questionIds],
    );
    return (
        <>
            <header className="chat-header">
                <VStack paddingInline={2} paddingBlock={1} gap={1}>
                    <ChatHeadingRow
                        parentTitle={
                            tree.branch
                                ? (state?.trees.find((t) => t.id === tree.branch!.parent)?.title ??
                                  'parent conversation')
                                : undefined
                        }
                        ancestors={ancestors}
                        current={tree}
                        addresses={addresses}
                        open={(id) => openConversation(id)}
                        openParent={() => openConversation(tree.branch!.parent)}
                        statsOpen={statsOpen}
                        toggleStats={() => setStatsOpen((open) => !open)}
                        expanded={expanded}
                        toggleExpanded={toggleExpanded}
                        returnToTree={returnToTree}
                        rename={() => setRenaming({ id: tree.id, place: 'header' })}
                    />
                    {modelNotice && (
                        <Text type="supporting" role="status">
                            {modelNotice}
                        </Text>
                    )}
                    {unavailableSelection && (
                        <Text type="supporting" role="alert">
                            Saved model or effort unavailable. Check Connections in Settings or
                            choose a listed model and effort. Your discussion is saved.
                        </Text>
                    )}
                    {tree.provider === 'codex' && codexFallback && (
                        <Text type="supporting" color="secondary" role="note">
                            GPT-6.1 Terra isn’t listed for this account. New conversations use{' '}
                            {codexFallback.label}, the account default.
                        </Text>
                    )}
                    {modelError && (
                        <HStack gap={2} vAlign="center" role="alert" className="failure-banner">
                            <Text type="supporting">{modelError}</Text>
                            <Button
                                label="Retry loading models"
                                variant="ghost"
                                size="sm"
                                onClick={() => void loadModels()}
                            />
                        </HStack>
                    )}
                    {!modelError && models && !models.length && (
                        <Button
                            label="Retry loading models"
                            variant="ghost"
                            size="sm"
                            onClick={() => void loadModels()}
                        />
                    )}
                </VStack>
            </header>
            {source && !validSource && (
                <Text role="alert">
                    Saved source passage is unavailable. No replacement passage was selected.
                </Text>
            )}
            <ChatLayout
                density="balanced"
                composer={
                    <ChatComposer
                        className={`attachment-composer${attach.dropping ? ' is-dropping' : ''}`}
                        {...attach.zone}
                        elevation="none"
                        sendButton={
                            models && !models.length && !active ? (
                                <IconButton
                                    label="Send"
                                    icon={<ArrowUpIcon />}
                                    variant="primary"
                                    isDisabled
                                />
                            ) : files.length && !(drafts[tree.id] ?? '').trim() && !active ? (
                                // The composer's own send needs text; files alone are a question too.
                                <IconButton
                                    label="Send"
                                    icon={<ArrowUpIcon />}
                                    variant="primary"
                                    onClick={() => {
                                        attach.clear();
                                        void send('', tree, false, files);
                                    }}
                                />
                            ) : undefined
                        }
                        sendActions={
                            replied && (
                                <Button
                                    className="ask-side"
                                    label="Ask on the side"
                                    variant="secondary"
                                    size="md"
                                    icon={
                                        <svg viewBox="0 0 16 16" aria-hidden className="fork-icon">
                                            <path d="M2 8H6L10 4H14M6 8L10 12H14" />
                                        </svg>
                                    }
                                    tooltip={
                                        sideBlocked ??
                                        'Opens a new branch with this question, keeping this conversation clean'
                                    }
                                    isDisabled={!!sideBlocked || props.branchForm.branching}
                                    onClick={() => void props.branchForm.askOnSide(draft)}
                                />
                            )
                        }
                        footerActions={
                            <>
                                <AttachButton
                                    add={attach.add}
                                    isDisabled={active || (!!models && !models.length)}
                                />
                                {modelMenu}
                            </>
                        }
                        value={drafts[tree.id] ?? ''}
                        onChange={(value) => setDrafts((d) => ({ ...d, [tree.id]: value }))}
                        onSubmit={(text) => {
                            if (models && !models.length) return;
                            attach.clear();
                            void send(text, tree, false, files);
                        }}
                        isStopShown={active}
                        onStop={() => stream.stop(tree.id)}
                        input={
                            // Tray and notices go in the input slot so they sit inside the composer's frame.
                            <>
                                <PendingAttachments
                                    files={files}
                                    remove={(i) => setFiles(files.filter((_, j) => j !== i))}
                                />
                                {models && !models.length && noModelNote}
                                {attach.notices}
                                <ChatComposerInput
                                    handleRef={composer}
                                    onFiles={attach.add}
                                    label="Your question"
                                    maxRows={4}
                                    value={drafts[tree.id] ?? ''}
                                    onChange={(value) =>
                                        setDrafts((d) => ({ ...d, [tree.id]: value }))
                                    }
                                    isDisabled={active || (!!models && !models.length)}
                                    placeholder={
                                        models && !models.length
                                            ? 'Sign in to a provider to ask'
                                            : files.length
                                              ? pendingPlaceholder(files.length)
                                              : 'What would you like to understand?'
                                    }
                                />
                            </>
                        }
                    />
                }
            >
                <ChatMessageList gap={2} align="top" isStreaming={active}>
                    <VStack gap={0} className="chat-title conv-title">
                        {renaming?.id === tree.id && renaming.place === 'header' ? (
                            <TitleEditor
                                key={tree.id}
                                title={tree.title}
                                save={(title) => rename(tree.id, title)}
                                cancel={finishRename}
                            />
                        ) : (
                            <Button
                                id="rename-conversation"
                                className="rename-title"
                                label="Rename conversation"
                                tooltip={tree.title}
                                variant="ghost"
                                size="sm"
                                onClick={() => setRenaming({ id: tree.id, place: 'header' })}
                            >
                                <span
                                    className="address-chip title-chip"
                                    aria-hidden
                                    style={inkStyle(addresses.get(tree.id)?.ink ?? 0)}
                                >
                                    {addresses.get(tree.id)?.address}
                                </span>
                                <Heading
                                    level={2}
                                    style={{
                                        viewTransitionName:
                                            !overview && transitionBox ? 'conversation' : undefined,
                                    }}
                                >
                                    {tree.title}
                                </Heading>
                            </Button>
                        )}
                    </VStack>
                    <TokenStats
                        open={statsOpen}
                        panel={statsPanel}
                        messages={tree.messages}
                        suggestions={tree.suggestions}
                    />
                    {tree.branch && (
                        <OriginStrip
                            branch={tree.branch}
                            // The thread's first bubble already shows the question; the origin line shows it only when no question is saved.
                            question={
                                tree.messages.some((m) => m.role === 'user')
                                    ? undefined
                                    : tree.branch.question
                            }
                            parentAddress={addresses.get(tree.branch.parent)?.address ?? ''}
                            parentTitle={
                                state?.trees.find((t) => t.id === tree.branch!.parent)?.title ??
                                'parent conversation'
                            }
                            openParent={(source) =>
                                void openConversation(tree.branch!.parent, source)
                            }
                        />
                    )}
                    <InheritedContext
                        branch={tree.branch}
                        parentTitle={
                            state?.trees.find((t) => t.id === tree.branch?.parent)?.title ??
                            'parent conversation'
                        }
                    />
                    {!tree.messages.length && (
                        <VStack gap={3} padding={6}>
                            <Heading level={3}>What are you curious about?</Heading>
                            <Text color="secondary">
                                Ask about a concept, work through an example, or pick up a question
                                you have been carrying.
                            </Text>
                        </VStack>
                    )}
                    <ChatThread
                        tree={tree}
                        c={c}
                        model={model}
                        trees={trees}
                        stream={stream}
                        branchForm={props.branchForm}
                        actions={actions}
                        active={active}
                        source={source}
                        validSource={validSource}
                    />
                </ChatMessageList>
            </ChatLayout>
            {!mobile && !overview && questions.length > 1 && (
                <TurnRail
                    questions={questions}
                    jump={(message) => setMessageTarget({ conversation: tree.id, message })}
                />
            )}
        </>
    );
}
