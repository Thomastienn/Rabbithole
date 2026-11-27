import { HStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { ChatMessage, ChatMessageBubble } from '@astryxdesign/core/Chat';
import type { Source } from '../map/TreeOverview';
import DiagramCard from '../media/DiagramCard';
import DiscussionCard from '../media/DiscussionCard';
import VideoCard from '../media/VideoCard';
import VisualFrame from '../media/VisualFrame';
import CopyButton from '../markdown/CopyButton';
import { SketchAsk } from '../markdown/Sketch';
import { withoutSketches } from '../markdown/markdownText';
import { artifactsAt } from '../media/artifacts';
import { visualsReady } from '../media/visualProgress';
import { replyUsageLine } from './turn';
import { FreeBranches, Groundwork, NextQuestions, ReplyFeedback, ReplyUsage } from './ChatDetails';
import Passage from './Passage';
import Reply from './Reply';
import BranchForm from './BranchForm';
import BoardSnapshot from '../board/BoardSnapshot';
import type { Summary } from '../map/TreeOverview';
import type { Tree } from './types';
import { figureList } from './figures';
import type { ChatModel } from './useChatModel';
import type { LearningTrees } from './useLearningTrees';
import type { ReplyStream } from './useReplyStream';
import type { BranchFormState } from './useBranchForm';
import { MessageAttachments } from './Attachments';
import type { TreeActions } from './useTreeActions';
import type { SettingsTab } from '../settings/SettingsWindow';

// The values the thread reads besides its conversation, its source passage and whether it replies.
export type ThreadProps = Pick<ChatModel, 'modelLabel'> &
    Pick<LearningTrees, 'openConversation' | 'addresses' | 'previews'> &
    Pick<ReplyStream, 'send' | 'replyDiscussion'> &
    Pick<
        BranchFormState,
        | 'branch'
        | 'setQuestion'
        | 'selectingMessage'
        | 'setSelectingMessage'
        | 'branching'
        | 'submitBranch'
        | 'closeBranch'
        | 'openVisualPart'
        | 'visualBranches'
        | 'widenPart'
        | 'discussionBranches'
        | 'groundworkBranches'
        | 'chooseGroundwork'
        | 'explainBrief'
        | 'pickPart'
        | 'startBranch'
    > &
    Pick<TreeActions, 'videoAction' | 'expandSketch'> & {
        trees: Summary[];
        openSettings: (section?: SettingsTab, focus?: string, opener?: HTMLElement | null) => void;
    };

// The passage branches made from a reply, as Passage marks them.
export const passageBranches = (trees: Summary[], parent: string, messageId: string) =>
    trees.flatMap((t) =>
        t.parent === parent &&
        t.messageId === messageId &&
        !t.artifactId &&
        t.start !== null &&
        t.end !== null &&
        t.passage !== null
            ? [{ start: t.start, end: t.end, text: t.passage, child: t.id, title: t.title }]
            : [],
    );

// The focused chat's questions and replies, with their figures, branch form and feedback.
export default function ChatThread({
    tree,
    overview,
    active,
    source,
    validSource,
    modelLabel,
    openConversation,
    addresses,
    previews,
    trees,
    send,
    replyDiscussion,
    videoAction,
    expandSketch,
    branch,
    setQuestion,
    selectingMessage,
    setSelectingMessage,
    branching,
    submitBranch,
    closeBranch,
    openVisualPart,
    visualBranches,
    widenPart,
    discussionBranches,
    groundworkBranches,
    chooseGroundwork,
    explainBrief,
    pickPart,
    startBranch,
    openSettings,
}: ThreadProps & {
    tree: Tree;
    overview: boolean;
    active: boolean;
    source?: Source;
    validSource?: boolean;
}) {
    // Previews cover only the open tree, so other trees add no figures and the count matches the sidebar.
    const figures = figureList(
        [...addresses.keys()].map((id) => ({ id })),
        previews,
        tree,
    ).map((f) => f.id);
    // A branch tip names the child's model as its reply heading does.
    const previewOf = (p?: NonNullable<Tree['branchPreviews']>[string]) =>
        p && {
            question: p.question,
            preview: p.preview,
            model: modelLabel({ ...p, effort: null }),
        };
    // A board reply left halfway is what was said, so it branches like a completed one, as in the board's rail.
    const partial = (m: Tree['messages'][number]) =>
        !overview && !!m.board && m.status === 'interrupted' && !!m.text;
    return tree.messages.map((message) => {
        const suggestions = tree.suggestions?.find((s) => s.message === message.id),
            index =
                tree.messages
                    .filter(
                        (m) => m.role === 'assistant' && (m.status === 'completed' || partial(m)),
                    )
                    .indexOf(message) + 1,
            partialBoardReply = partial(message),
            copyable = message.status === 'completed' || partialBoardReply,
            visualCount =
                message.role === 'assistant' &&
                visualsReady(artifactsAt(tree.artifacts ?? [], tree.id, message.id));
        return (
            <ChatMessage
                key={message.id}
                data-chat-message={message.id}
                sender={message.role === 'user' ? 'user' : 'assistant'}
                className={message.role === 'user' ? 'chat-question' : 'chat-reply'}
                name={
                    message.role === 'assistant' && (
                        <Text type="supporting" color="secondary">
                            Tutor · {modelLabel(tree)}
                        </Text>
                    )
                }
                metadata={
                    !overview &&
                    message.role === 'assistant' &&
                    (copyable || !!message.mediaUsage?.length || !!visualCount) && (
                        <HStack gap={2} vAlign="center">
                            {copyable && (
                                <CopyButton
                                    text={withoutSketches(message.text)}
                                    label={index ? `Copy tutor reply ${index}` : 'Copy tutor reply'}
                                    className="reply-copy"
                                />
                            )}
                            {(message.usage !== undefined || !!message.mediaUsage?.length) && (
                                <ReplyUsage
                                    line={replyUsageLine(
                                        message.usage ?? null,
                                        suggestions?.usage,
                                        message.mediaUsage,
                                    )}
                                />
                            )}
                            {message.memoryUpdated && (
                                <Button
                                    label="Memory updated"
                                    variant="ghost"
                                    size="sm"
                                    className="reply-memory"
                                    onClick={(e) =>
                                        openSettings('models', '#memory-note', e.currentTarget)
                                    }
                                />
                            )}
                            {visualCount && (
                                <Text type="supporting" color="secondary" className="reply-visuals">
                                    {visualCount}
                                </Text>
                            )}
                        </HStack>
                    )
                }
            >
                {message.role === 'assistant' && (
                    <Groundwork
                        suggestions={suggestions}
                        explored={groundworkBranches[message.id]}
                        choose={(concept) => chooseGroundwork(message.id, concept)}
                    />
                )}
                {message.role === 'assistant' ? (
                    <SketchAsk.Provider
                        value={{
                            ask: (anchor, origin) => startBranch(tree.id, anchor, origin),
                            messageId: message.id,
                            open:
                                branch?.parent === tree.id && branch.anchor.messageId === message.id
                                    ? branch.anchor
                                    : undefined,
                            branches: trees.flatMap((t) =>
                                t.parent === tree.id &&
                                t.messageId === message.id &&
                                !t.artifactId &&
                                t.label &&
                                t.start != null &&
                                t.end != null
                                    ? [
                                          {
                                              start: t.start,
                                              end: t.end,
                                              label: t.label,
                                              child: t.id,
                                              ...addresses.get(t.id),
                                          },
                                      ]
                                    : [],
                            ),
                            openChild: (id) => void openConversation(id),
                        }}
                    >
                        <Passage
                            message={
                                partialBoardReply ? { ...message, status: 'completed' } : message
                            }
                            addresses={addresses}
                            resources={tree.resources}
                            suggestions={suggestions}
                            briefs={tree.briefs?.filter((b) => b.message === message.id)}
                            onVisualPart={openVisualPart}
                            visualBranches={visualBranches}
                            discussionBranches={discussionBranches}
                            onArtifactAction={(artifactId, action, instruction) =>
                                videoAction(tree.id, artifactId, action, instruction)
                            }
                            onDiscussionReply={replyDiscussion}
                            onExpandSketch={
                                overview ? undefined : (at) => expandSketch(tree.id, message.id, at)
                            }
                            inlineArtifacts={
                                overview
                                    ? undefined
                                    : artifactsAt(tree.artifacts ?? [], tree.id, message.id).filter(
                                          (a) =>
                                              ['visual', 'video', 'discussion'].includes(a.kind) &&
                                              a.position != null,
                                      )
                            }
                            branched={passageBranches(trees, tree.id, message.id).map((b) => ({
                                ...b,
                                ...previewOf(tree.branchPreviews?.[b.child]),
                            }))}
                            index={index}
                            reveal={
                                validSource && source?.messageId === message.id ? source : undefined
                            }
                            form={
                                branch?.parent === tree.id && branch.anchor.messageId === message.id
                                    ? {
                                          at: branch.anchor.at,
                                          node: (
                                              <BranchForm
                                                  branch={branch}
                                                  branching={branching}
                                                  // A question about the streaming reply itself waits for it instead.
                                                  active={active && message.status !== 'streaming'}
                                                  submit={submitBranch}
                                                  // Ask here: a normal turn in this conversation, the passage quoted above the question.
                                                  askHere={
                                                      active
                                                          ? undefined
                                                          : () => {
                                                                closeBranch(false);
                                                                void send(
                                                                    `${branch.anchor.text.replace(/^/gm, '> ')}\n\n${branch.question}`,
                                                                    tree,
                                                                );
                                                            }
                                                  }
                                                  close={closeBranch}
                                                  setQuestion={setQuestion}
                                                  explain={(anchor) =>
                                                      explainBrief(branch.parent, anchor)
                                                  }
                                                  widen={widenPart}
                                                  pick={pickPart}
                                                  saved={
                                                      tree.briefs?.find(
                                                          (b) =>
                                                              branch.anchor.artifactId ===
                                                                  undefined &&
                                                              b.message ===
                                                                  branch.anchor.messageId &&
                                                              b.start === branch.anchor.start &&
                                                              b.end === branch.anchor.end,
                                                      )?.explanation
                                                  }
                                              />
                                          ),
                                          // Discussion offsets are inside a card line, and a sketch item's span its whole sketch, not reply text.
                                          ...(branch.anchor.artifactId === undefined &&
                                              !branch.anchor.sketch && {
                                                  start: branch.anchor.start,
                                                  end: branch.anchor.end,
                                              }),
                                      }
                                    : undefined
                            }
                            onOpenChild={(id) => void openConversation(id)}
                            selecting={selectingMessage === message.id}
                            openSelection={() => setSelectingMessage(message.id)}
                            closeSelection={() => setSelectingMessage(undefined)}
                            onBranch={(anchor, origin) => startBranch(tree.id, anchor, origin)}
                        />
                    </SketchAsk.Provider>
                ) : (
                    <>
                        {!!message.attachments?.length && (
                            <MessageAttachments
                                conversation={tree.id}
                                attachments={message.attachments}
                            />
                        )}
                        {message.text && (
                            <ChatMessageBubble variant="ghost" className="question-bubble">
                                {/* Markdown only: suggestions, inline media and branching stay reply features. */}
                                <Reply text={message.text} underlines={[]} />
                            </ChatMessageBubble>
                        )}
                    </>
                )}
                {message.snapshot && <BoardSnapshot items={message.snapshot} />}

                {!overview &&
                    message.role === 'assistant' &&
                    artifactsAt(tree.artifacts ?? [], tree.id, message.id)
                        .filter((a) => a.kind === 'mermaid' || a.position == null)
                        .map((artifact, _, all) =>
                            artifact.kind === 'discussion' ? (
                                <DiscussionCard
                                    key={artifact.id}
                                    artifact={artifact}
                                    onReply={replyDiscussion}
                                />
                            ) : artifact.kind === 'visual' ? (
                                <VisualFrame
                                    key={artifact.id}
                                    artifact={artifact}
                                    explored={visualBranches[artifact.id]}
                                    onOpenChild={(id) => void openConversation(id)}
                                    reveal={
                                        validSource &&
                                        source?.artifactId === artifact.id &&
                                        source.line === undefined
                                            ? source
                                            : undefined
                                    }
                                    onPart={openVisualPart}
                                    onRetry={() => videoAction(tree.id, artifact.id, 'retry')}
                                    onRegenerate={(instruction) =>
                                        videoAction(tree.id, artifact.id, 'regenerate', instruction)
                                    }
                                    onPrevious={() => videoAction(tree.id, artifact.id, 'previous')}
                                />
                            ) : artifact.kind === 'video' ? (
                                <VideoCard
                                    key={artifact.id}
                                    inline
                                    artifact={artifact}
                                    onAction={(action, instruction) =>
                                        videoAction(tree.id, artifact.id, action, instruction)
                                    }
                                />
                            ) : (
                                <DiagramCard
                                    key={artifact.id}
                                    artifact={artifact}
                                    steps={all.filter((a) => a.kind === 'mermaid')}
                                    figure={figures.indexOf(artifact.id) + 1 || undefined}
                                    onRetry={() => videoAction(tree.id, artifact.id, 'retry')}
                                />
                            ),
                        )}
                {/* A board reply the learner left halfway shows no notice (mockup Rabbithole-brd.16, state 2). */}
                {!(partialBoardReply && message.stopped === 'learner') && (
                    <ReplyFeedback
                        message={message}
                        suggestions={suggestions}
                        overview={overview}
                        active={active}
                        latest={message === tree.messages.at(-1)}
                        previous={tree.messages.at(-2)}
                        compactionError={tree.compaction?.error}
                        retry={(text) => void send(text, tree, true)}
                    />
                )}
                {/* An empty passage marks a free branch; its row sits between the reply and its next questions. */}
                <FreeBranches
                    branches={trees
                        .filter(
                            (t) =>
                                t.parent === tree.id &&
                                t.messageId === message.id &&
                                !t.artifactId &&
                                t.passage === '',
                        )
                        .map((t) => ({ child: t.id, title: t.title, ...addresses.get(t.id) }))
                        .sort((a, b) =>
                            (a.address ?? '').localeCompare(b.address ?? '', undefined, {
                                numeric: true,
                            }),
                        )}
                    open={(id) => void openConversation(id)}
                />
                <NextQuestions
                    message={message}
                    latest={message === tree.messages.at(-1)}
                    overview={overview}
                    active={active}
                    ask={(question) => void send(question, tree)}
                />
            </ChatMessage>
        );
    });
}
