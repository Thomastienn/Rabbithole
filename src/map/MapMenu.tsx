import { IconButton } from '@astryxdesign/core/IconButton';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import type { MapActions } from './TreeOverview';
import type { SettingsTab } from '../settings/SettingsWindow';
import type { Tree } from '../chat/types';

const mapMenuTrigger = () =>
  document.querySelector<HTMLElement>('.map-toolbar [aria-label="Map menu"]');

// The map toolbar's overflow menu; without actions (no tree open) the map commands are disabled.
export default function MapMenu({
  actions,
  tree,
  openLibrary,
  openSettings,
  askDelete,
}: {
  actions?: MapActions;
  tree?: Tree;
  openLibrary: () => void;
  openSettings: (section?: SettingsTab, focus?: string, opener?: HTMLElement | null) => void;
  askDelete: (id: string, origin: HTMLElement | null) => void;
}) {
  return (
    <DropdownMenu
      presentation="popover"
      renderTrigger={(props) => (
        <IconButton
          {...props}
          label="Map menu"
          tooltip="Map menu"
          icon={<EllipsisHorizontalIcon />}
          variant="ghost"
          size="sm"
        />
      )}
      items={[
        { label: 'Learning trees', onClick: openLibrary },
        { label: 'Settings', onClick: () => openSettings(undefined, undefined, mapMenuTrigger()) },
        { label: 'Expand all', isDisabled: !actions, onClick: actions?.expand },
        { label: 'Collapse all', isDisabled: !actions, onClick: actions?.collapse },
        { label: 'Keep current branch', isDisabled: !actions?.canKeep, onClick: actions?.keep },
        { label: 'Help', onClick: () => openSettings('interface', undefined, mapMenuTrigger()) },
        { type: 'divider' },
        {
          label: tree?.branch ? 'Delete branch…' : 'Delete chat…',
          variant: 'destructive',
          isDisabled: !tree,
          onClick: () => tree && askDelete(tree.id, mapMenuTrigger()),
        },
      ]}
    />
  );
}
