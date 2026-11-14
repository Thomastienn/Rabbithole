import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { DropdownMenu, DropdownMenuItem } from '@astryxdesign/core/DropdownMenu';
import { EllipsisHorizontalIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import TitleEditor from '../chat/TitleEditor';
import { inkStyle, volumeCounts, type treeGroups } from './treeList';

type Tree = { id: string; parent: string | null; created: number; title: string };

// Library volumes by date group; ChatPage owns opening, renaming and deleting.
export default function LibraryShelf({
  groups,
  layout,
  current,
  renaming,
  today,
  onOpen,
  onRename,
  onCancelRename,
  onStartRename,
  onDelete,
}: {
  groups: ReturnType<typeof treeGroups<Tree>>;
  layout: 'shelf' | 'list';
  current?: string | null;
  renaming?: string;
  today: Date;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onCancelRename: () => void;
  onStartRename: (id: string) => void;
  onDelete: (id: string, origin: HTMLElement | null) => void;
}) {
  return (
    <nav aria-label="Saved learning trees" className="tree-list" data-layout={layout}>
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <Heading level={2} className="tree-date-heading">
            {group.label}
          </Heading>
          <ul className={layout === 'shelf' ? 'shelf' : 'library-list'}>
            {group.trees.map(({ tree: t, branches, spine }) => (
              <li
                key={t.id}
                className="volume"
                data-current={current === t.id}
                data-renaming={renaming === t.id}
              >
                {renaming === t.id ? (
                  <TitleEditor
                    title={t.title}
                    save={(title) => onRename(t.id, title)}
                    cancel={onCancelRename}
                  />
                ) : (
                  <>
                    <span className="volume-band">
                      <Button
                        className="saved-chat-title"
                        label={t.title}
                        variant="ghost"
                        aria-current={current === t.id ? 'true' : undefined}
                        aria-describedby={`tree-date-${t.id} branch-count-${t.id}`}
                        onClick={() => onOpen(t.id)}
                      >
                        <Text as="span" type="inherit" maxLines={4}>
                          {t.title}
                        </Text>
                      </Button>
                      <Text
                        as="span"
                        type="supporting"
                        id={`tree-date-${t.id}`}
                        className="volume-date"
                      >
                        <time dateTime={new Date(t.created).toISOString()}>
                          Started{' '}
                          {new Date(t.created).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year:
                              new Date(t.created).getFullYear() === today.getFullYear()
                                ? undefined
                                : 'numeric',
                          })}
                        </time>
                      </Text>
                    </span>
                    <span className="volume-meta">
                      <span
                        className="volume-spine"
                        aria-hidden
                        title="One tick per conversation, in its branch family's ink"
                      >
                        {spine.map((ink, i) => (
                          <i key={i} style={inkStyle(ink)} />
                        ))}
                      </span>
                      <Text type="supporting" color="secondary" id={`branch-count-${t.id}`}>
                        {volumeCounts(branches)}
                      </Text>
                    </span>
                    <DropdownMenu
                      presentation="popover"
                      alignment="end"
                      renderTrigger={(props) => (
                        <IconButton
                          {...props}
                          id={`chat-actions-${t.id}`}
                          className="tree-row-actions"
                          label={`Actions for ${t.title}`}
                          icon={<EllipsisHorizontalIcon />}
                          variant="ghost"
                          size="sm"
                        />
                      )}
                    >
                      <DropdownMenuItem
                        label="Rename chat"
                        icon={<PencilSquareIcon />}
                        onClick={() => onStartRename(t.id)}
                      />
                      <DropdownMenuItem
                        className="delete-menu-item"
                        label="Delete chat…"
                        icon={<TrashIcon />}
                        onClick={() =>
                          onDelete(t.id, document.getElementById(`chat-actions-${t.id}`))
                        }
                      />
                    </DropdownMenu>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!groups.length && <Text color="secondary">No learning tree titles match.</Text>}
    </nav>
  );
}
