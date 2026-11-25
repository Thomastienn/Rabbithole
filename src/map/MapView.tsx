import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Switch } from '@astryxdesign/core/Switch';
import { ChatBubbleLeftRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import TreeOverview, { type MapActions } from './TreeOverview';
import MapDivider from './MapDivider';
import type { ChatState } from '../chat/useChatState';
import type { LayoutSaving } from './useLayoutSaving';
import type { LearningTrees } from '../chat/useLearningTrees';
import type { ReplyStream } from '../chat/useReplyStream';
import type { BranchFormState } from '../chat/useBranchForm';
import type { MapViewState } from './useMapViewState';
import type { ChatTargets } from '../chat/useChatTargets';
import { savedGhostTrees, savePreference } from '../shell/preferences';

// The learning tree map beside or instead of the focused chat, with its resize divider.
export default function MapView({
    root,
    overview,
    expanded,
    mobile,
    transitionBox,
    workspaceWidth,
    workspace,
    overviewOrigin,
    state,
    tree,
    previews,
    changeView,
    openConversation,
    openGhost,
    folded,
    setFolded,
    ghostMarks,
    shownMapWidth,
    setMapWidth,
    focusNext,
    savePositions,
    saveViewport,
    saveGhost,
    retryFromMap,
    askFromMap,
    branching,
    vim,
    menu,
    search,
}: {
    vim: boolean;
    search: () => void;
    menu: (actions?: MapActions) => React.ReactNode;
} & Pick<
    ChatState,
    | 'root'
    | 'overview'
    | 'expanded'
    | 'mobile'
    | 'transitionBox'
    | 'workspaceWidth'
    | 'workspace'
    | 'overviewOrigin'
> &
    Pick<
        LearningTrees,
        'state' | 'tree' | 'previews' | 'changeView' | 'openConversation' | 'openGhost'
    > &
    Pick<MapViewState, 'folded' | 'setFolded' | 'ghostMarks' | 'shownMapWidth' | 'setMapWidth'> &
    Pick<ChatTargets, 'focusNext'> &
    Pick<LayoutSaving, 'savePositions' | 'saveViewport' | 'saveGhost'> &
    Pick<ReplyStream, 'retryFromMap'> &
    Pick<BranchFormState, 'askFromMap' | 'branching'>) {
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
                        lead={
                            // Labelled because the rail and the hidden narrow header leave no named way in.
                            <Button
                                className="map-search"
                                label={mobile ? 'Search' : 'Search tree'}
                                tooltip="Search inside every conversation in this tree (Ctrl+K)"
                                icon={<MagnifyingGlassIcon />}
                                endContent={mobile ? undefined : <Kbd keys="mod+k" />}
                                variant="ghost"
                                size="sm"
                                aria-haspopup="dialog"
                                aria-keyshortcuts="Control+K"
                                onClick={search}
                            />
                        }
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
