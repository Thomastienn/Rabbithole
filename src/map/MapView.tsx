import { IconButton } from '@astryxdesign/core/IconButton';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import TreeOverview, { type MapActions } from './TreeOverview';
import MapDivider from './MapDivider';
import type { ChatState } from '../chat/useChatState';
import type { LayoutSaving } from './useLayoutSaving';
import type { LearningTrees } from '../chat/useLearningTrees';
import type { ReplyStream } from '../chat/useReplyStream';

// The learning tree map beside or instead of the focused chat, with its resize divider.
export default function MapView({
  c,
  layout: { savePositions, saveViewport },
  trees: { openConversation, openGhost },
  stream: { retryFromMap },
  vim,
  menu,
}: {
  c: ChatState;
  layout: LayoutSaving;
  trees: LearningTrees;
  stream: ReplyStream;
  vim: boolean;
  menu: (actions?: MapActions) => React.ReactNode;
}) {
  const { root, state, tree, overview, expanded, mobile, previews, transitionBox } = c;
  const { shownMapWidth, workspaceWidth, workspace, setMapWidth, overviewOrigin } = c;
  const { focusComposer, changeView, setFolds, ghostMarks } = c;
  const marks = ghostMarks?.root === root ? ghostMarks : undefined;
  return (
    <>
      {root && state && !overview && !expanded && !mobile && (
        <MapDivider
          width={shownMapWidth}
          workspaceWidth={workspaceWidth}
          workspace={workspace}
          setWidth={setMapWidth}
        />
      )}
      {root && state && (
        <section
          id="learning-tree-map"
          className="overview"
          data-chat-open={!overview}
          aria-label="Learning tree"
        >
          <TreeOverview
            vim={vim}
            toolbar={
              overview &&
              tree && (
                <IconButton
                  label="Reopen chat"
                  tooltip={`Open chat: ${tree.title}`}
                  icon={<ChatBubbleLeftRightIcon />}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    focusComposer.current = true;
                    changeView(false, tree.id);
                  }}
                />
              )
            }
            menu={menu}
            key={root}
            root={root}
            trees={state.trees}
            previews={previews}
            active={state.active}
            open={(id, source, message, artifact) =>
              void openConversation(id, source, artifact, message)
            }
            retry={retryFromMap}
            save={savePositions}
            saveViewport={saveViewport}
            focus={overview ? overviewOrigin.current?.id : undefined}
            focusControl={overviewOrigin.current?.control}
            transition={overview ? transitionBox : undefined}
            selected={overview ? undefined : tree?.id}
            current={tree?.id}
            initialFolded={state.trees.find((t) => t.id === root)?.layout?.folded}
            onFold={(ids) => setFolds({ root, ids })}
            marked={marks?.ids}
            from={marks?.from}
            openGhost={(ghost) => openGhost(ghost, root)}
          />
        </section>
      )}
    </>
  );
}
