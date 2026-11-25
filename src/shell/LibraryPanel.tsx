import { useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import {
    PlusIcon,
    MagnifyingGlassIcon,
    RectangleStackIcon,
    ListBulletIcon,
} from '@heroicons/react/24/outline';
import LibraryShelf from '../map/LibraryShelf';
import { treeGroups, markLibraryScrolling, librarySearch } from '../map/treeList';
import { savedLibraryLayout, savePreference } from './preferences';
import type { ChatState } from '../chat/useChatState';
import type { LearningTrees } from '../chat/useLearningTrees';
import type { TreeActions } from '../chat/useTreeActions';

// The Library tab: every learning tree as shelf volumes or a list, with search.
export default function LibraryPanel({
    tab,
    error,
    root,
    renaming,
    setRenaming,
    today,
    busy,
    openTree,
    state,
    newChat,
    rename,
    finishRename,
    askDelete,
    firstQuestion,
}: {
    busy: boolean;
    firstQuestion: React.ReactNode;
} & Pick<ChatState, 'tab' | 'error' | 'root' | 'renaming' | 'setRenaming' | 'today'> &
    Pick<LearningTrees, 'openTree' | 'state'> &
    Pick<TreeActions, 'newChat' | 'rename' | 'finishRename' | 'askDelete'>) {
    const [libraryQuery, setLibraryQuery] = useState('');
    const scrollQuiet = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [libraryLayout, setLibraryLayout] = useState(savedLibraryLayout);
    const libraryGroups = treeGroups(librarySearch(state?.trees ?? [], libraryQuery), today);
    return (
        <main
            hidden={tab !== 'library'}
            className="library-panel"
            aria-label="Learning trees"
            onScroll={(e) => {
                scrollQuiet.current = markLibraryScrolling(e.currentTarget, scrollQuiet.current);
            }}
        >
            {tab === 'library' && (
                <VStack gap={0} className="library-content">
                    <HStack gap={4} vAlign="end" wrap="wrap" className="library-head">
                        <VStack gap={2}>
                            <Heading level={1}>Library</Heading>
                            <Text color="secondary" className="library-intro">
                                Every learning tree you have started. One tick is one conversation,
                                in the colour of its line.
                            </Text>
                        </VStack>
                        <Button
                            label={busy ? 'Opening…' : 'New chat'}
                            variant="primary"
                            icon={<PlusIcon />}
                            isDisabled={busy}
                            onClick={newChat}
                        />
                    </HStack>
                    {error && (
                        <Text className="failure-banner" role="alert">
                            {error}
                        </Text>
                    )}
                    {state && !state.trees.length
                        ? firstQuestion
                        : state && (
                              <>
                                  <HStack
                                      gap={2}
                                      vAlign="center"
                                      wrap="wrap"
                                      className="library-tools"
                                  >
                                      <TextInput
                                          label="Search learning tree titles"
                                          isLabelHidden
                                          placeholder="Search learning trees"
                                          startIcon={MagnifyingGlassIcon}
                                          size="lg"
                                          hasClear
                                          value={libraryQuery}
                                          onChange={setLibraryQuery}
                                          width={320}
                                      />
                                      <SegmentedControl
                                          label="Library layout"
                                          size="lg"
                                          value={libraryLayout}
                                          onChange={(v) => {
                                              setLibraryLayout(v as 'shelf' | 'list');
                                              savePreference('library-layout', v);
                                          }}
                                      >
                                          <SegmentedControlItem
                                              value="shelf"
                                              label="Shelf"
                                              icon={<RectangleStackIcon />}
                                          />
                                          <SegmentedControlItem
                                              value="list"
                                              label="List"
                                              icon={<ListBulletIcon />}
                                          />
                                      </SegmentedControl>
                                  </HStack>
                                  <LibraryShelf
                                      groups={libraryGroups}
                                      query={libraryQuery}
                                      layout={libraryLayout}
                                      current={root}
                                      renaming={
                                          renaming?.place === 'library' ? renaming.id : undefined
                                      }
                                      today={today}
                                      onOpen={(id) => openTree(id, undefined, undefined, true)}
                                      onRename={rename}
                                      onCancelRename={finishRename}
                                      onStartRename={(id) => setRenaming({ id, place: 'library' })}
                                      onDelete={askDelete}
                                      onNewChat={busy ? undefined : newChat}
                                  />
                              </>
                          )}
                </VStack>
            )}
        </main>
    );
}
