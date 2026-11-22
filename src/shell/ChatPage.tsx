import { useRef, useState, type CSSProperties } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ShareIcon, FilmIcon, BookOpenIcon, MapIcon, CubeIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@astryxdesign/core/theme';
import TreeSearch from './TreeSearch';
import ShellBand, { SaveAlert, viewTab } from './ShellBand';
import { savedVim, savePreference } from './preferences';
import LibraryPanel from './LibraryPanel';
import ReturnPanel from './ReturnPanel';
import FirstRunSetup from './FirstRunSetup';
import type { Appearance, ThemeChoice } from './appearance';
import type { MapActions } from '../map/TreeOverview';
import MapMenu from '../map/MapMenu';
import MapView from '../map/MapView';
import KnowledgePage from '../knowledge/KnowledgePage';
import VideoLibrary from '../media/VideoLibrary';
import PieceLibrary from '../media/PieceLibrary';
import SettingsWindow, { type SettingsRequest, type SettingsTab } from '../settings/SettingsWindow';
import { FirstQuestion, TreeLoading, TreeLoadFailure } from '../chat/ChatStates';
import Contents from '../chat/Contents';
import FocusedChat from '../chat/FocusedChat';
import DeleteDialog from '../chat/DeleteDialog';
import ModelMenu from '../chat/ModelMenu';
import { useChatState } from '../chat/useChatState';
import { useLearningTrees } from '../chat/useLearningTrees';
import { useChatModel } from '../chat/useChatModel';
import { useChatTargets } from '../chat/useChatTargets';
import { useReplyStream } from '../chat/useReplyStream';
import { useBranchForm } from '../chat/useBranchForm';
import { useTreeActions } from '../chat/useTreeActions';

export default function ChatPage({
    appearance,
    setAppearance,
    theme,
    setTheme,
}: {
    appearance: Appearance;
    setAppearance: (next: Appearance) => void;
    theme: ThemeChoice;
    setTheme: (next: ThemeChoice) => void;
}) {
    const { mode } = useTheme();
    const c = useChatState();
    const { error, setError, mobile, tab, setTab, drawer, setDrawer } = c;
    const { root, overview, expanded, focusComposer } = c;
    const [settings, setSettings] = useState<SettingsRequest>();
    const settingsOpener = useRef<HTMLElement | null>(null),
        settingsFrom = useRef('learning');
    const [searching, setSearching] = useState(false);
    const searchFromDrawer = useRef(false);
    // Only this boolean is stored, per browser and app origin; unreadable storage means off.
    const [vim, setVim] = useState(savedVim);
    const trees = useLearningTrees(c);
    const { state, tree, loading, layout, changeView, returnToTree } = trees;
    const model = useChatModel(c, trees);
    useChatTargets(c, tree);
    const stream = useReplyStream(c, trees, model, { name: theme, mode });
    const branchForm = useBranchForm(c, trees, model, stream);
    const actions = useTreeActions(c, trees, stream, branchForm);
    const { visibleIds, addresses, previews } = trees;
    const { shownMapWidth, workspace } = c;
    const { drafts, setDraft, pendingFiles, setFiles, busy, create } = stream;
    const visibleSet = new Set(visibleIds);
    const { branch } = branchForm;
    const { openTree, openConversation, loadInitial, select, titleSearch, activeKey } = trees;
    const opened = trees.openId();
    const { models, providers, modelError, loadModels, signIn, currentModel } = model;
    const { cancelDelete } = actions;
    const { newChat, askDelete } = actions;
    const active = !!tree && !!state?.active.includes(tree.id);
    function openSettings(
        section?: SettingsTab,
        focus?: string,
        opener = document.activeElement as HTMLElement | null,
    ) {
        settingsOpener.current = opener;
        if (tab !== 'settings') settingsFrom.current = tab;
        setTab('settings');
        setSettings({ tab: section, focus });
    }
    function closeSettings() {
        setSettings(undefined);
        setTab(settingsFrom.current);
        // Menu items that opened the window are gone by now; fall back to the menu trigger that held them.
        const opener = settingsOpener.current;
        requestAnimationFrame(() =>
            (opener?.isConnected
                ? opener
                : document.querySelector<HTMLElement>('.map-toolbar [aria-label="Map menu"]')
            )?.focus(),
        );
    }
    const menu = (actions?: MapActions) => (
        <MapMenu
            actions={actions}
            tree={tree}
            openLibrary={() => setTab('library')}
            openSettings={openSettings}
            askDelete={askDelete}
        />
    );
    const reading = tab === 'learning' && (!overview || !root),
        mapping = tab === 'learning' && overview && !!root;
    const views = [
        viewTab('Read', <BookOpenIcon />, reading, () => {
            setTab('learning');
            if (overview && root) {
                focusComposer.current = true;
                changeView(false, tree?.id);
            }
        }),
        viewTab(
            'Map',
            <MapIcon />,
            mapping,
            () => {
                setTab('learning');
                if (!overview) returnToTree();
            },
            !root,
        ),
        viewTab('Knowledge', <ShareIcon />, tab === 'knowledge', () => setTab('knowledge')),
        viewTab('Videos', <FilmIcon />, tab === 'videos', () => setTab('videos')),
        viewTab('Pieces', <CubeIcon />, tab === 'pieces', () => setTab('pieces')),
    ];
    const contents = () =>
        root &&
        state && (
            <Contents
                root={root}
                trees={state.trees.filter((t) => visibleSet.has(t.id))}
                addresses={addresses}
                previews={previews}
                current={tree}
                active={state.active}
                open={(id) => {
                    setTab('learning');
                    void openConversation(id);
                }}
                openFigure={(id, artifact) => {
                    setTab('learning');
                    void openConversation(id, undefined, artifact);
                }}
            />
        );
    const band = (
        <ShellBand
            mobile={mobile}
            tab={tab}
            busy={busy}
            drawer={drawer}
            views={views}
            saveAlert={
                root &&
                state &&
                layout.layoutFailed && (
                    <SaveAlert retry={() => void layout.saver.current?.flush()} />
                )
            }
            // The narrow drawer offers the outline from every tab, as the old drawer did.
            contents={(mobile || tab === 'learning') && contents()}
            setDrawer={setDrawer}
            search={() => {
                searchFromDrawer.current = drawer;
                setSearching(true);
            }}
            newChat={newChat}
            library={() => setTab('library')}
            settings={(e) =>
                openSettings(
                    undefined,
                    undefined,
                    // The drawer's Settings button leaves with the drawer; focus returns to its opener.
                    mobile
                        ? document.querySelector<HTMLElement>('.band-contents')
                        : e.currentTarget,
                )
            }
        />
    );
    const modelMenu = (
        <ModelMenu
            model={model}
            active={active}
            busy={busy}
            openSettings={openSettings}
            setError={setError}
        />
    );
    const firstQuestion = (
        <FirstQuestion
            draft={drafts.first ?? ''}
            setDraft={(value) => setDraft('first', value)}
            files={pendingFiles.first ?? []}
            setFiles={(files) => setFiles('first', files)}
            busy={busy}
            available={!!currentModel}
            modelMenu={modelMenu}
            submit={(text) => void create(text)}
            modelError={modelError}
            loadModels={() => void loadModels()}
            noModels={!!models && !models.length}
            needsModel={!!model.firstModel && !model.firstModel.provider}
            openSettings={(opener) => openSettings(undefined, undefined, opener)}
        />
    );
    return (
        <VStack
            gap={0}
            style={{ height: '100dvh' }}
            onKeyDown={(e) => {
                if (e.key !== 'Escape' || e.defaultPrevented) return;
                if ((e.target as Element).closest('.delete-dialog')) {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelDelete();
                } else if (
                    tab === 'settings' &&
                    !(e.target as Element).closest('dialog, [role=listbox], [role=menu]')
                ) {
                    e.preventDefault();
                    closeSettings();
                }
            }}
        >
            {mobile && band}
            {/* Outside the band so the palette keeps popover colours. */}
            <TreeSearch
                isOpen={searching}
                onOpenChange={(open) => {
                    setSearching(open);
                    // The drawer's Search button leaves with the drawer; focus returns to the drawer's opener.
                    if (!open && searchFromDrawer.current)
                        requestAnimationFrame(() =>
                            document.querySelector<HTMLElement>('.band-contents')?.focus(),
                        );
                }}
                searchSource={titleSearch}
                onValueChange={(id) => id && openTree(id)}
            />
            <HStack gap={0} style={{ flex: 1, minHeight: 0 }}>
                {!mobile && band}
                <HStack
                    gap={0}
                    style={{ flex: 1, minHeight: 0, minWidth: 0 }}
                    className="workspace"
                >
                    <main
                        className="conversation"
                        hidden={tab !== 'learning'}
                        aria-label="Learning workspace"
                    >
                        <Heading level={1} className="sr-only">
                            Rabbithole
                        </Heading>
                        {error && (
                            <section role="alert" className="failure-banner workspace-failure">
                                <Text>{error}</Text>
                            </section>
                        )}
                        <section
                            className="tree-workspace"
                            data-expanded={expanded && !overview}
                            style={{ '--map-width': `${shownMapWidth}rem` } as CSSProperties}
                        >
                            <section ref={workspace} className="reading-workspace">
                                <section
                                    id="focused-chat"
                                    className="focused-chat"
                                    style={{ display: overview && root ? 'none' : 'flex' }}
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === 'Escape' &&
                                            !branch &&
                                            !e.defaultPrevented &&
                                            !(e.target as Element).closest(
                                                '[role=menu], video, dialog',
                                            )
                                        ) {
                                            e.preventDefault();
                                            returnToTree();
                                        }
                                    }}
                                >
                                    {tree ? (
                                        <FocusedChat
                                            tree={tree}
                                            c={c}
                                            model={model}
                                            trees={trees}
                                            stream={stream}
                                            branchForm={branchForm}
                                            actions={actions}
                                            active={active}
                                            modelMenu={modelMenu}
                                        />
                                    ) : (
                                        <VStack gap={0} className="overview">
                                            <HStack
                                                padding={1}
                                                className="map-toolbar"
                                                role="group"
                                                aria-label="Tree view controls"
                                            >
                                                {menu()}
                                            </HStack>
                                            <VStack
                                                padding={6}
                                                gap={3}
                                                hAlign="center"
                                                vAlign="center"
                                                className="empty-map"
                                            >
                                                {!state && error ? (
                                                    <Button
                                                        label="Retry loading learning trees"
                                                        variant="secondary"
                                                        onClick={loadInitial}
                                                    />
                                                ) : loading || !state ? (
                                                    <TreeLoading />
                                                ) : opened ? (
                                                    <TreeLoadFailure
                                                        retry={() => void select(opened)}
                                                    />
                                                ) : state.firstRun ? (
                                                    <FirstRunSetup
                                                        models={models}
                                                        providers={providers}
                                                        modelError={modelError}
                                                        auth={state.auth}
                                                        loadModels={() => void loadModels()}
                                                        signIn={signIn}
                                                        done={(chat) => {
                                                            trees.setState(
                                                                (s) =>
                                                                    s && { ...s, firstRun: false },
                                                            );
                                                            if (chat)
                                                                model.chooseModel(
                                                                    chat.provider,
                                                                    chat.model!,
                                                                    chat.effort,
                                                                );
                                                        }}
                                                    />
                                                ) : (
                                                    tab === 'learning' && firstQuestion
                                                )}
                                            </VStack>
                                        </VStack>
                                    )}
                                </section>
                                <MapView
                                    c={c}
                                    layout={layout}
                                    trees={trees}
                                    stream={stream}
                                    branchForm={branchForm}
                                    vim={vim}
                                    menu={menu}
                                />
                            </section>
                        </section>
                    </main>
                    <LibraryPanel
                        c={c}
                        busy={busy}
                        trees={trees}
                        actions={actions}
                        firstQuestion={firstQuestion}
                    />
                    <ReturnPanel
                        label="Knowledge"
                        returnId="return-to-learning"
                        shown={tab === 'knowledge'}
                        overview={overview}
                        back={() => setTab('learning')}
                    >
                        <KnowledgePage activity={activeKey} />
                    </ReturnPanel>
                    <ReturnPanel
                        label="Videos"
                        returnId="return-from-videos"
                        shown={tab === 'videos'}
                        overview={overview}
                        back={() => setTab('learning')}
                    >
                        <VideoLibrary activity={activeKey} />
                    </ReturnPanel>
                    <ReturnPanel
                        label="Pieces"
                        returnId="return-from-pieces"
                        shown={tab === 'pieces'}
                        overview={overview}
                        back={() => setTab('learning')}
                    >
                        <PieceLibrary />
                    </ReturnPanel>
                    <SettingsWindow
                        request={tab === 'settings' ? settings : undefined}
                        close={closeSettings}
                        models={models}
                        providers={providers}
                        modelError={modelError}
                        loadModels={loadModels}
                        profileActivated={model.profileActivated}
                        auth={state?.auth}
                        signIn={signIn}
                        vim={vim}
                        setVim={(on) => {
                            setVim(on);
                            savePreference('vim', on ? 'on' : 'off');
                        }}
                        appearance={appearance}
                        setAppearance={setAppearance}
                        theme={theme}
                        setTheme={setTheme}
                    />
                </HStack>
            </HStack>
            <DeleteDialog actions={actions} />
        </VStack>
    );
}
