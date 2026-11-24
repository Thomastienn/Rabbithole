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
import { artifactsAt } from '../media/artifacts';
import { visualsReady } from '../media/visualProgress';
import { replyUsageLine } from './turn';
import { FreeBranches, Groundwork, NextQuestions, ReplyFeedback, ReplyUsage } from './ChatDetails';
import Passage from './Passage';
import Reply from './Reply';
import BranchForm from './BranchForm';
import type { Summary } from '../map/TreeOverview';
import type { Tree } from './types';
import type { ChatModel } from './useChatModel';
import type { LearningTrees } from './useLearningTrees';
import type { ReplyStream } from './useReplyStream';
import type { BranchFormState } from './useBranchForm';
import { MessageAttachments } from './Attachments';
import type { TreeActions } from './useTreeActions';
import type { SettingsTab } from '../settings/SettingsWindow';

// The values the thread reads besides its conversation, its source passage and whether it replies.
export type ThreadProps = Pick<ChatModel, 'modelLabel'> &
    Pick<LearningTrees, 'openConversation' | 'addresses'> &
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
    Pick<TreeActions, 'videoAction'> & {
        trees: Summary[];
        openSettings: (section?: SettingsTab, focus?: string, opener?: HTMLElement | null) => void;
    };

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
    trees,
    send,
    replyDiscussion,
    videoAction,
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
    return tree.messages.map((message) => {
        const suggestions = tree.suggestions?.find((s) => s.message === message.id),
            index =
                tree.messages
                    .filter((m) => m.role === 'assistant' && m.status === 'completed')
                    .indexOf(message) + 1,
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
                    (message.status === 'completed' ||
                        !!message.mediaUsage?.length ||
                        !!visualCount) && (
                        <HStack gap={2} vAlign="center">
                            {message.status === 'completed' && (
                                <CopyButton
                                    text={message.text}
                                    label={`Copy tutor reply ${index}`}
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
                    <Passage
                        message={message}
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
                        inlineArtifacts={
                            overview
                                ? undefined
                                : artifactsAt(tree.artifacts ?? [], tree.id, message.id).filter(
                                      (a) =>
                                          ['visual', 'video', 'discussion'].includes(a.kind) &&
                                          a.position != null,
                                  )
                        }
                        branched={trees.flatMap((t) =>
                            t.parent === tree.id &&
                            t.messageId === message.id &&
                            !t.artifactId &&
                            t.start !== null &&
                            t.end !== null &&
                            t.passage !== null
                                ? [
                                      {
                                          start: t.start,
                                          end: t.end,
                                          text: t.passage,
                                          child: t.id,
                                          title: t.title,
                                          ...tree.branchPreviews?.[t.id],
                                      },
                                  ]
                                : [],
                        )}
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
                                                          branch.anchor.artifactId === undefined &&
                                                          b.message === branch.anchor.messageId &&
                                                          b.start === branch.anchor.start &&
                                                          b.end === branch.anchor.end,
                                                  )?.explanation
                                              }
                                          />
                                      ),
                                      // Discussion offsets are inside a card line, not the reply text.
                                      start:
                                          branch.anchor.artifactId === undefined
                                              ? branch.anchor.start
                                              : undefined,
                                      end:
                                          branch.anchor.artifactId === undefined
                                              ? branch.anchor.end
                                              : undefined,
                                  }
                                : undefined
                        }
                        onOpenChild={(id) => void openConversation(id)}
                        selecting={selectingMessage === message.id}
                        openSelection={() => setSelectingMessage(message.id)}
                        closeSelection={() => setSelectingMessage(undefined)}
                        onBranch={(anchor, origin) => startBranch(tree.id, anchor, origin)}
                    />
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
                                    onAction={(action) => videoAction(tree.id, artifact.id, action)}
                                />
                            ) : (
                                <DiagramCard
                                    key={artifact.id}
                                    artifact={artifact}
                                    steps={all.filter((a) => a.kind === 'mermaid')}
                                    onRetry={() => videoAction(tree.id, artifact.id, 'retry')}
                                />
                            ),
                        )}
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
