import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { ChatMessage, ChatMessageBubble } from '@astryxdesign/core/Chat';
import type { Source } from '../map/TreeOverview';
import DiagramCard from '../media/DiagramCard';
import VideoCard from '../media/VideoCard';
import VisualFrame from '../media/VisualFrame';
import CopyButton from '../markdown/CopyButton';
import { artifactsAt } from '../media/artifacts';
import { replyUsageLine } from './turn';
import { ReplyFeedback } from './ChatDetails';
import Passage from './Passage';
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
  trees: { openConversation },
  stream: { send },
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
  const { overview, addresses, state, branch, setBranch, selectingMessage, setSelectingMessage } =
    c;
  const { branching, concept, submitBranch, closeBranch, openVisualPart, visualBranches } =
    branchForm;
  return tree.messages.map((message) => {
    const suggestions = tree.suggestions?.find((s) => s.message === message.id),
      index =
        tree.messages
          .filter((m) => m.role === 'assistant' && m.status === 'completed')
          .indexOf(message) + 1;
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
          (message.status === 'completed' || !!message.mediaUsage?.length) && (
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
                  {replyUsageLine(message.usage ?? null, suggestions?.usage, message.mediaUsage)}
                </Text>
              )}
            </HStack>
          )
        }
      >
        {message.role === 'assistant' ? (
          <Passage
            message={message}
            addresses={addresses}
            suggestions={suggestions}
            onVisualPart={openVisualPart}
            visualBranches={visualBranches}
            onArtifactAction={(artifactId, action) => videoAction(tree.id, artifactId, action)}
            inlineArtifacts={
              overview
                ? undefined
                : artifactsAt(tree.artifacts ?? [], tree.id, message.id).filter(
                    (a) => (a.kind === 'visual' || a.kind === 'video') && a.position != null,
                  )
            }
            branched={
              state?.trees.flatMap((t) =>
                t.parent === tree.id &&
                t.messageId === message.id &&
                t.start !== null &&
                t.end !== null &&
                t.passage !== null
                  ? [
                      {
                        start: t.start,
                        end: t.end,
                        text: t.passage,
                        child: t.id,
                      },
                    ]
                  : [],
              ) ?? []
            }
            index={index}
            reveal={validSource && source?.messageId === message.id ? source : undefined}
            form={
              branch?.parent === tree.id && branch.anchor.messageId === message.id
                ? {
                    at: branch.anchor.at,
                    node: (
                      <BranchForm
                        branch={branch}
                        branching={branching}
                        active={active}
                        concept={concept}
                        api={c.api}
                        submit={submitBranch}
                        close={closeBranch}
                        setQuestion={(question) => setBranch((b) => b && { ...b, question })}
                      />
                    ),
                    start: branch.anchor.start,
                    end: branch.anchor.end,
                  }
                : undefined
            }
            onOpenChild={(id) => void openConversation(id)}
            selecting={selectingMessage === message.id}
            openSelection={() => setSelectingMessage(message.id)}
            closeSelection={() => setSelectingMessage(undefined)}
            onBranch={(anchor, origin) => branchForm.startBranch(tree.id, anchor, origin)}
          />
        ) : (
          <>
            {!!message.attachments?.length && (
              <MessageAttachments conversation={tree.id} attachments={message.attachments} />
            )}
            {message.text && (
              <ChatMessageBubble variant="ghost" className="question-bubble">
                <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {message.text}
                </Text>
              </ChatMessageBubble>
            )}
          </>
        )}

        {!overview &&
          message.role === 'assistant' &&
          artifactsAt(tree.artifacts ?? [], tree.id, message.id)
            .filter((a) => a.kind === 'mermaid' || a.position == null)
            .map((artifact, _, all) =>
              artifact.kind === 'visual' ? (
                <VisualFrame
                  key={artifact.id}
                  artifact={artifact}
                  explored={visualBranches[artifact.id]}
                  onOpenChild={(id) => void openConversation(id)}
                  reveal={validSource && source?.artifactId === artifact.id ? source : undefined}
                  onPart={openVisualPart}
                  onRetry={() => videoAction(tree.id, artifact.id, 'retry')}
                  onRegenerate={() => videoAction(tree.id, artifact.id, 'regenerate')}
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
      </ChatMessage>
    );
  });
}
