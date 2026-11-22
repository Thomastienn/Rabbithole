import { useState } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Switch } from '@astryxdesign/core/Switch';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import TreeOverview, { type MapActions } from './TreeOverview';
import MapDivider from './MapDivider';
import type { ChatState } from '../chat/useChatState';
import type { LayoutSaving } from './useLayoutSaving';
import type { LearningTrees } from '../chat/useLearningTrees';
import type { ReplyStream } from '../chat/useReplyStream';
import type { BranchFormState } from '../chat/useBranchForm';
import { savedGhostTrees, savePreference } from '../shell/preferences';

// The learning tree map beside or instead of the focused chat, with its resize divider.
export default function MapView({
    c,
    layout: { savePositions, saveViewport, saveGhost },
    trees,
    stream: { retryFromMap },
    branchForm: { askFromMap, branching },
    vim,
    menu,
}: {
    c: ChatState;
    layout: LayoutSaving;
    trees: LearningTrees;
    stream: ReplyStream;
    branchForm: BranchFormState;
    vim: boolean;
    menu: (actions?: MapActions) => React.ReactNode;
}) {
    const { root, overview, expanded, mobile, transitionBox } = c;
    const { workspaceWidth, workspace, overviewOrigin } = c;
    const { state, tree, previews, changeView, openConversation, openGhost } = trees;
    const { folded, setFolded, ghostMarks, shownMapWidth, setMapWidth } = trees.map;
    const { focusNext } = trees.targets;
    const marks = ghostMarks?.root === root ? ghostMarks : undefined;
    const [ghostsShown, setGhostsShown] = useState(savedGhostTrees);
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
                            <>
                                <Switch
                                    label="Ghost trees"
                                    value={ghostsShown}
                                    onChange={(on) => {
                                        setGhostsShown(on);
                                        savePreference('ghost-trees', on ? 'on' : 'off');
                                    }}
                                />
                                {overview && tree && (
                                    <IconButton
                                        label="Reopen chat"
                                        tooltip={`Open chat: ${tree.title}`}
                                        icon={<ChatBubbleLeftRightIcon />}
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            focusNext();
                                            changeView(false, tree.id);
                                        }}
                                    />
                                )}
                            </>
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
                        ask={askFromMap}
                        branching={branching}
                        save={savePositions}
                        saveViewport={saveViewport}
                        focus={overview ? overviewOrigin.current?.id : undefined}
                        focusControl={overviewOrigin.current?.control}
                        transition={overview ? transitionBox : undefined}
                        selected={overview ? undefined : tree?.id}
                        current={tree?.id}
                        folded={folded}
                        setFolded={setFolded}
                        marked={marks?.ids}
                        from={marks?.from}
                        ghosts={{
                            shown: ghostsShown,
                            open: (ghost) => openGhost(ghost, root),
                            save: saveGhost,
                        }}
                    />
                </section>
            )}
        </>
    );
}
