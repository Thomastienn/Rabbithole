import { useRef, useState } from 'react';
import type { SettingsRequest, SettingsTab } from '../settings/SettingsWindow';

// The Settings window as a tab of its own: it opens on a section, and closing returns to the tab and the control that opened it.
export function useSettingsWindow(tab: string, setTab: (tab: string) => void) {
    const [settings, setSettings] = useState<SettingsRequest>();
    const settingsOpener = useRef<HTMLElement | null>(null),
        settingsFrom = useRef('learning');
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
    return { settings, openSettings, closeSettings };
}
