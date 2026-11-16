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
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { savedFocusMode, savePreference } from './preferences';
import { Logo } from './Logo';

export const viewTab = (
  label: string,
  icon: React.ReactNode,
  current: boolean,
  onClick: (e: MouseEvent<HTMLButtonElement>) => void,
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
        header={
          <DrawerHeader className="drawer-head" title="Rabbithole" onOpenChange={setDrawer} />
        }
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
  tab,
  busy,
  drawer,
  views,
  saveAlert,
  contents,
  setDrawer,
  search,
  newChat,
  library,
  settings,
}: {
  mobile: boolean;
  tab: string;
  busy: boolean;
  drawer: boolean;
  views: ReactNode[];
  saveAlert: ReactNode;
  contents?: ReactNode;
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
      // Hiding the top bar from its focused toggle leaves the restore button showing so focus has somewhere to stay.
      setRevealed(!focusMode && restoreFocus);
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
  // Ctrl+Shift+O skips the typing guard so it works from the composer too.
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.isComposing ||
        !e.ctrlKey ||
        !e.shiftKey ||
        e.altKey ||
        e.metaKey ||
        e.key.toLowerCase() !== 'o'
      )
        return;
      e.preventDefault();
      if (!e.repeat && !busy) newChat();
    };
    addEventListener('keydown', shortcut);
    return () => removeEventListener('keydown', shortcut);
  }, [busy, newChat]);
  // Narrow screens keep their header; Focus mode hides that header there.
  // Desktop: one toggle stays at the top left, a menu button while the sidebar is hidden and a close button beside its logo.
  const bar = mobile ? 'top bar' : 'sidebar';
  const focusButton = (
    <IconButton
      ref={focusToggle}
      className={mobile ? (focusMode ? 'focus-restore' : 'band-focus') : 'sidebar-toggle'}
      label={`${focusMode ? 'Show' : 'Hide'} ${bar}`}
      tooltip={`${focusMode ? 'Show' : 'Hide'} ${bar} (Ctrl+Shift+F)`}
      aria-expanded={!focusMode}
      aria-keyshortcuts="Control+Shift+F"
      icon={
        mobile ? (
          focusMode ? (
            <ChevronDownIcon />
          ) : (
            <ChevronUpIcon />
          )
        ) : focusMode ? (
          <Bars3Icon />
        ) : (
          <XMarkIcon />
        )
      }
      variant="ghost"
      size={mobile ? 'sm' : 'lg'}
      onClick={toggleFocusMode}
    />
  );
  // Narrow screens: a hot zone along the top edge; the restore button stays in the tab order but shows only on hover or focus.
  // The save alert stays mounted outside it so its alert role is still announced while hidden.
  if (focusMode && mobile)
    return (
      <>
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
        {saveAlert && <div className="focus-save">{saveAlert}</div>}
      </>
    );
  const sidebar = (
    <nav className="sidebar" aria-label="App">
      <VStack gap={0} className="sidebar-top">
        <HStack gap={1} vAlign="center" className="sidebar-head">
          <Button
            className="sidebar-mark"
            label="Rabbithole"
            tooltip="Open the Library"
            variant="ghost"
            size="sm"
            onClick={library}
          >
            <Logo />
            <span className="band-mark">Rabbithole</span>
          </Button>
        </HStack>
        <HStack gap={1} vAlign="center" className="sidebar-tools">
          <Button
            className="new-chat"
            label={busy ? 'Opening…' : 'New chat'}
            tooltip="New chat (Ctrl+Shift+O)"
            variant="primary"
            size="sm"
            icon={<PlusIcon />}
            isDisabled={busy}
            onClick={newChat}
          />
          <IconButton
            className="tree-search"
            label="Search learning trees"
            tooltip="Search learning trees"
            variant="ghost"
            size="sm"
            icon={<MagnifyingGlassIcon />}
            aria-haspopup="dialog"
            onClick={search}
          />
        </HStack>
        <VStack gap={0} className="sidebar-views">
          {views}
          {viewTab('Library', <RectangleStackIcon />, tab === 'library', library)}
        </VStack>
        {saveAlert}
      </VStack>
      {contents}
      <div className="sidebar-foot">
        {viewTab('Settings', <Cog6ToothIcon />, tab === 'settings', settings)}
      </div>
    </nav>
  );
  // The save alert stays mounted while the sidebar is hidden so its alert role is still announced.
  if (focusMode)
    return (
      <>
        {focusButton}
        {saveAlert && <div className="focus-save">{saveAlert}</div>}
      </>
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
      <Logo />
      <Text className="band-mark" weight="bold">
        Rabbithole
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
    <>
      {focusButton}
      {sidebar}
    </>
  );
}
