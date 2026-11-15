import { useCallback, useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { HStack, Layout as Regions, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import {
  Bars3Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline';
import { savedFocusMode, savePreference } from './preferences';

export const viewTab = (
  label: string,
  icon: React.ReactNode,
  current: boolean,
  onClick: () => void,
  disabled = false,
) => (
  <Button
    key={label}
    className="view-tab"
    label={label}
    icon={icon}
    variant="ghost"
    size="sm"
    aria-current={current ? 'page' : undefined}
    isDisabled={disabled}
    onClick={onClick}
  />
);

export function ContentsDrawer({
  drawer,
  setDrawer,
  views,
  contents,
  library,
  settings,
  tab,
}: {
  tab: string;
  drawer: boolean;
  setDrawer: (open: boolean) => void;
  views: ReactNode[];
  contents: ReactNode;
  library: () => void;
  settings: () => void;
}) {
  return (
    <Drawer
      isOpen={drawer}
      onOpenChange={setDrawer}
      label="Contents"
      side="start"
      width={320}
      padding={0}
    >
      <Regions
        padding={2}
        header={<DrawerHeader className="drawer-head" title="TreeTutor" onOpenChange={setDrawer} />}
        content={
          <LayoutContent padding={0}>
            <VStack
              gap={0}
              className="band-drawer"
              onClick={(e) => {
                if ((e.target as Element).closest('button')) setDrawer(false);
              }}
            >
              <nav aria-label="Views" className="drawer-views">
                {views.slice(0, 2)}
                {viewTab('Library', <RectangleStackIcon />, tab === 'library', library)}
                {views.slice(2)}
              </nav>
              {contents}
              <Button
                className="view-tab drawer-settings"
                label="Settings"
                icon={<Cog6ToothIcon />}
                variant="ghost"
                size="sm"
                onClick={settings}
              />
            </VStack>
          </LayoutContent>
        }
      />
    </Drawer>
  );
}

export function SaveAlert({ retry }: { retry: () => void }) {
  return (
    <HStack gap={1} vAlign="center" role="alert" className="band-save">
      <Text type="supporting" weight="semibold">
        Map layout not saved.
        <span className="sr-only"> It retries every minute while this tree stays open.</span>
      </Text>
      <Button label="Retry saving layout" variant="ghost" size="sm" onClick={retry} />
    </HStack>
  );
}

export default function ShellBand({
  mobile,
  rootTitle,
  tab,
  busy,
  drawer,
  views,
  saveAlert,
  setDrawer,
  search,
  newChat,
  library,
  settings,
}: {
  mobile: boolean;
  rootTitle?: string;
  tab: string;
  busy: boolean;
  drawer: boolean;
  views: ReactNode[];
  saveAlert: ReactNode;
  setDrawer: (open: boolean) => void;
  search: () => void;
  newChat: () => void;
  library: () => void;
  settings: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const [focusMode, setFocusMode] = useState(savedFocusMode);
  const [revealed, setRevealed] = useState(false);
  const focusToggle = useRef<HTMLButtonElement>(null);
  const toggleFocusMode = useCallback(() => {
    const restoreFocus = document.activeElement === focusToggle.current;
    flushSync(() => {
      setFocusMode(!focusMode);
      setRevealed(false);
    });
    savePreference('focus-mode', focusMode ? 'off' : 'on');
    if (restoreFocus) focusToggle.current?.focus();
  }, [focusMode]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.repeat ||
        e.isComposing ||
        !e.ctrlKey ||
        !e.shiftKey ||
        e.altKey ||
        e.metaKey ||
        e.key.toLowerCase() !== 'f' ||
        (e.target instanceof Element &&
          e.target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .astryx-chat-composer',
          ))
      )
        return;
      e.preventDefault();
      toggleFocusMode();
    };
    addEventListener('keydown', shortcut);
    return () => removeEventListener('keydown', shortcut);
  }, [toggleFocusMode]);
  const focusButton = (
    <IconButton
      ref={focusToggle}
      className={focusMode ? 'focus-restore' : 'band-focus'}
      label={focusMode ? 'Show top bar' : 'Hide top bar'}
      tooltip={`${focusMode ? 'Show' : 'Hide'} top bar (Ctrl+Shift+F)`}
      aria-expanded={!focusMode}
      aria-keyshortcuts="Control+Shift+F"
      icon={focusMode ? <ChevronDownIcon /> : <ChevronUpIcon />}
      variant="ghost"
      size="sm"
      onClick={toggleFocusMode}
    />
  );
  // Hot zone along the top edge: the restore button stays in the tab order but shows only on hover or focus.
  if (focusMode)
    return (
      <div
        className="focus-hot-zone"
        data-revealed={revealed}
        onMouseEnter={() => setRevealed(true)}
        onMouseLeave={() => setRevealed(false)}
        onFocus={() => setRevealed(true)}
        onBlur={() => setRevealed(false)}
      >
        {focusButton}
      </div>
    );
  return mobile ? (
    <header className="shell-band">
      <IconButton
        className="band-contents"
        label="Contents"
        tooltip="Contents"
        icon={<Bars3Icon />}
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={drawer}
        onClick={() => setDrawer(true)}
      />
      <Text className="band-mark" weight="bold">
        <img src="/logo.svg" alt="" width={24} height={24} />
        TreeTutor
      </Text>
      <HStack gap={1} vAlign="center" className="band-tools">
        {focusButton}
        <IconButton
          className="tree-search"
          label="Search learning trees"
          tooltip="Search learning trees"
          icon={<MagnifyingGlassIcon />}
          variant="ghost"
          size="sm"
          aria-haspopup="dialog"
          onClick={search}
        />
        <IconButton
          className="new-chat"
          label={busy ? 'Opening…' : 'New chat'}
          tooltip="New chat"
          icon={<PlusIcon />}
          variant="ghost"
          size="sm"
          isDisabled={busy}
          onClick={newChat}
        />
      </HStack>
      {saveAlert}
    </header>
  ) : (
    <header className="shell-band">
      <Text className="band-mark" weight="bold">
        <img src="/logo.svg" alt="" width={24} height={24} />
        TreeTutor
      </Text>
      <Button
        className="tree-switcher"
        label={rootTitle ? `${rootTitle} · Learning trees` : 'Learning trees'}
        tooltip="Open the library of learning trees"
        variant="ghost"
        size="sm"
        aria-current={tab === 'library' ? 'page' : undefined}
        onClick={library}
      >
        <span className="tree-switcher-content">
          <span className="tree-switcher-title">{rootTitle ?? 'Learning trees'}</span>
          <ChevronDownIcon className="tree-switcher-icon" aria-hidden />
        </span>
      </Button>
      <nav aria-label="Views" className="view-tabs">
        {views}
      </nav>
      <HStack gap={1} vAlign="center" className="band-tools">
        {saveAlert}
        {focusButton}
        <IconButton
          className="tree-search"
          label="Search learning trees"
          tooltip="Search learning trees"
          icon={<MagnifyingGlassIcon />}
          variant="ghost"
          size="sm"
          aria-haspopup="dialog"
          onClick={search}
        />
        <Button
          className="new-chat"
          label={busy ? 'Opening…' : 'New chat'}
          variant="ghost"
          size="sm"
          icon={<PlusIcon />}
          isDisabled={busy}
          onClick={newChat}
        />
        <IconButton
          className="band-settings"
          label="Settings"
          tooltip="Settings"
          icon={<Cog6ToothIcon />}
          variant="ghost"
          size="sm"
          aria-current={tab === 'settings' ? 'page' : undefined}
          onClick={settings}
        />
      </HStack>
    </header>
  );
}
