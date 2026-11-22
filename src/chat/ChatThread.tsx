import { HStack } from '@astryxdesign/core/Layout';
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
import { FreeBranches, Groundwork, NextQuestions, ReplyFeedback } from './ChatDetails';
import Passage from './Passage';
import Reply from './Reply';
import BranchForm from './BranchForm';
import type { Tree } from './types';
import type { ChatState } from './useChatState';
import type { ChatModel } from './useChatModel';
import type { LearningTrees } from './useLearningTrees';
import type { ReplyStream } from './useReplyStream';
import type { BranchFormState } from './useBranchForm';
import { MessageAttachments } from './Attachments';
import type { TreeActions } from './useTreeActions';

// The focused chat's questions and replies, with their figures, branch form and feedback.
export default function ChatThread({
    tree,
    c,
    model: { modelLabel },
    trees: { openConversation, addresses, state },
    stream: { send, replyDiscussion },
    branchForm,
    actions: { videoAction },
    active,
    source,
    validSource,
}: {
    tree: Tree;
    c: ChatState;
    model: ChatModel;
    trees: LearningTrees;
    stream: ReplyStream;
    branchForm: BranchFormState;
    actions: TreeActions;
    active: boolean;
    source?: Source;
    validSource?: boolean;
}) {
    const { overview, branch, setBranch, selectingMessage, setSelectingMessage } = c;
    const { branching, submitBranch, closeBranch, openVisualPart, visualBranches, widenPart } =
        branchForm;
    const { discussionBranches, groundworkBranches, chooseGroundwork, explainBrief } = branchForm;
    const { pickPart } = branchForm;
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
                                <Text type="supporting" color="secondary" className="reply-usage">
                                    {replyUsageLine(
                                        message.usage ?? null,
                                        suggestions?.usage,
                                        message.mediaUsage,
                                    )}
                                </Text>
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
                        onArtifactAction={(artifactId, action) =>
                            videoAction(tree.id, artifactId, action)
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
                        branched={
                            state?.trees.flatMap((t) =>
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
                                          },
                                      ]
                                    : [],
                            ) ?? []
                        }
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
                                              setQuestion={(question) =>
                                                  setBranch((b) => b && { ...b, question })
                                              }
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
                        onBranch={(anchor, origin) =>
                            branchForm.startBranch(tree.id, anchor, origin)
                        }
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
                                    onRegenerate={() =>
                                        videoAction(tree.id, artifact.id, 'regenerate')
                                    }
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
                    branches={(state?.trees ?? [])
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
