// Stored per browser and app origin; unreadable storage means off.
export function savedVim() {
    try {
        return localStorage.getItem('rabbithole.vim') === 'on';
    } catch {
        return false;
    }
}

export function savedFocusMode() {
    try {
        return localStorage.getItem('rabbithole.focus-mode') === 'on';
    } catch {
        return false;
    }
}

// Ghost trees show unless they were switched off.
export function savedGhostTrees() {
    try {
        return localStorage.getItem('rabbithole.ghost-trees') !== 'off';
    } catch {
        return true;
    }
}

// The desktop app shows the open tree as the Discord status unless it was switched off.
export function savedDiscordStatus() {
    try {
        return localStorage.getItem('rabbithole.discord-status') !== 'off';
    } catch {
        return true;
    }
}

// Library opens as a shelf unless List was chosen.
export function savedLibraryLayout(): 'shelf' | 'list' {
    try {
        return localStorage.getItem('rabbithole.library-layout') === 'list' ? 'list' : 'shelf';
    } catch {
        return 'shelf';
    }
}

export function savePreference(
    key:
        | 'appearance'
        | 'theme'
        | 'vim'
        | 'library-layout'
        | 'focus-mode'
        | 'ghost-trees'
        | 'discord-status'
        | 'reading-font'
        | 'interface-font',
    value: string,
) {
    try {
        localStorage.setItem(`rabbithole.${key}`, value);
    } catch {
        /* Preference stays for this session only. */
    }
}
