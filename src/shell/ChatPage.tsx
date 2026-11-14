import { useRef, useState, type CSSProperties } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import {
  ChevronRightIcon,
  ShareIcon,
  FilmIcon,
  BookOpenIcon,
  MapIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@astryxdesign/core/theme';
import TreeSearch from './TreeSearch';
import ShellBand, { ContentsDrawer, SaveAlert, viewTab } from './ShellBand';
import { savedVim, savePreference } from './preferences';
import LibraryPanel from './LibraryPanel';
import ReturnPanel from './ReturnPanel';
import type { Appearance, ThemeChoice } from './appearance';
import type { MapActions } from '../map/TreeOverview';
import MapMenu from '../map/MapMenu';
import MapView from '../map/MapView';
import { useLayoutSaving } from '../map/useLayoutSaving';
import KnowledgePage from '../knowledge/KnowledgePage';
import VideoLibrary from '../media/VideoLibrary';
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
  const { state, tree, error, setError, busy, loading, mobile, tab, setTab, drawer, setDrawer } = c;
  const { root, overview, expanded, selected, focusComposer, changeView, returnToTree } = c;
  const [settings, setSettings] = useState<SettingsRequest>();
  const settingsOpener = useRef<HTMLElement | null>(null),
    settingsFrom = useRef('learning');
  const [searching, setSearching] = useState(false);
  // Only this boolean is stored, per browser and app origin; unreadable storage means off.
  const [vim, setVim] = useState(savedVim);
  const layout = useLayoutSaving(c);
  const trees = useLearningTrees(c, layout);
  const model = useChatModel(c);
  useChatTargets(c);
  const stream = useReplyStream(c, trees, model, { name: theme, mode });
  const actions = useTreeActions(c, layout, trees, model, stream);
  const branchForm = useBranchForm(c, trees, model, stream);
  const { visibleIds, addresses, previews, drafts, setDrafts, shownMapWidth, workspace } = c;
  const { contentsOpen, toggleContents, branch, api } = c;
  const { openTree, openConversation, loadInitial, select, titleSearch, activeKey } = trees;
  const { models, providers, modelError, loadModels, signIn, currentModel } = model;
  const { cancelDelete } = actions;
  const { newChat, create, askDelete } = actions;
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
  const rootTitle = state?.trees.find((t) => t.id === root)?.title;
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
  ];
  const contents = (collapse?: () => void) =>
    root &&
    state && (
      <Contents
        collapse={collapse}
        root={root}
        trees={state.trees.filter((t) => visibleIds.includes(t.id))}
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
  // Narrow band (mockup Narrow): views, the outline and Settings move into this drawer; any choice inside closes it.
  const narrowDrawer = (
    <ContentsDrawer
      tab={tab}
      drawer={drawer}
      setDrawer={setDrawer}
      views={views}
      contents={contents()}
      library={() => setTab('library')}
      settings={() =>
        openSettings(undefined, undefined, document.querySelector<HTMLElement>('.band-contents'))
      }
    />
  );
  const band = (
    <ShellBand
      mobile={mobile}
      rootTitle={rootTitle}
      tab={tab}
      busy={busy}
      drawer={drawer}
      views={views}
      saveAlert={
        root &&
        state &&
        layout.layoutFailed && <SaveAlert retry={() => void layout.saver.current?.flush()} />
      }
      setDrawer={setDrawer}
      search={() => setSearching(true)}
      newChat={newChat}
      library={() => setTab('library')}
      settings={(e) => openSettings(undefined, undefined, e.currentTarget)}
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
      setDraft={(value) => setDrafts((d) => ({ ...d, first: value }))}
      busy={busy}
      available={!!currentModel}
      modelMenu={modelMenu}
      submit={(text) => void create(text)}
      modelError={modelError}
      loadModels={() => void loadModels()}
      noModels={!!models && !models.length}
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
      {band}
      {mobile && narrowDrawer}
      {/* Outside the band so the palette keeps popover colours. */}
      <TreeSearch
        isOpen={searching}
        onOpenChange={setSearching}
        searchSource={titleSearch}
        onValueChange={(id) => id && openTree(id)}
      />
      <HStack gap={0} style={{ flex: 1, minHeight: 0 }} className="workspace">
        <main className="conversation" hidden={tab !== 'learning'} aria-label="Learning workspace">
          <Heading level={1} className="sr-only">
            TreeTutor
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
            {!overview &&
              !mobile &&
              (contentsOpen ? (
                contents(() => toggleContents(false))
              ) : (
                <aside className="contents-rail" aria-label="Learning tree contents">
                  <IconButton
                    className="contents-reopen"
                    label="Show contents"
                    tooltip="Show contents"
                    aria-expanded={false}
                    icon={<ChevronRightIcon />}
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleContents(true)}
                  />
                </aside>
              ))}
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
                    !(e.target as Element).closest('[role=menu], video, dialog')
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
                      ) : selected.current ? (
                        <TreeLoadFailure retry={() => void select(selected.current!)} />
                      ) : (
                        tab === 'learning' && firstQuestion
                      )}
                    </VStack>
                  </VStack>
                )}
              </section>
              <MapView c={c} layout={layout} trees={trees} stream={stream} vim={vim} menu={menu} />
            </section>
          </section>
        </main>
        <LibraryPanel c={c} trees={trees} actions={actions} firstQuestion={firstQuestion} />
        <ReturnPanel
          label="Knowledge"
          returnId="return-to-learning"
          shown={tab === 'knowledge'}
          overview={overview}
          back={() => setTab('learning')}
        >
          <KnowledgePage api={c.api} activity={activeKey} />
        </ReturnPanel>
        <ReturnPanel
          label="Videos"
          returnId="return-from-videos"
          shown={tab === 'videos'}
          overview={overview}
          back={() => setTab('learning')}
        >
          <VideoLibrary api={c.api} activity={activeKey} />
        </ReturnPanel>
        <SettingsWindow
          request={tab === 'settings' ? settings : undefined}
          close={closeSettings}
          api={api}
          models={models}
          providers={providers}
          modelError={modelError}
          loadModels={loadModels}
          conceptNameTokens={state?.conceptNameTokens}
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
      <DeleteDialog actions={actions} />
    </VStack>
  );
}
