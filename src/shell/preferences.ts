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

// The board's speech speeds; 1.25× unless the learner chose another.
export const BOARD_SPEEDS = [1, 1.25, 1.5, 1.75, 2];
export const DEFAULT_BOARD_SPEED = 1.25;
export function savedBoardSpeed() {
    try {
        const speed = Number(localStorage.getItem('rabbithole.board-speed'));
        return BOARD_SPEEDS.includes(speed) ? speed : DEFAULT_BOARD_SPEED;
    } catch {
        return DEFAULT_BOARD_SPEED;
    }
}

// Push-to-talk on a board: on unless switched off in Settings.
export function savedPushToTalk() {
    try {
        return localStorage.getItem('rabbithole.push-to-talk') !== 'off';
    } catch {
        return true;
    }
}

// How a board runs: learner-led unless tutor-guided is chosen in Settings.
export function savedTutorGuided() {
    try {
        return localStorage.getItem('rabbithole.board-mode') === 'guided';
    } catch {
        return false;
    }
}

// How often the tutor checks in on a board: now and then unless another level is chosen in Settings.
export type CheckIns = 'off' | 'sometimes' | 'often';
export function savedCheckIns(): CheckIns {
    try {
        const level = localStorage.getItem('rabbithole.check-ins');
        return level === 'off' || level === 'often' ? level : 'sometimes';
    } catch {
        return 'sometimes';
    }
}

// The board's Voice languages, English first: the keys of the server's voice table (server/board/speech.mjs).
export const VOICE_LANGUAGES = ['en', 'zh', 'nl', 'fr', 'de', 'it', 'ja', 'pt', 'es'];
export function savedVoiceLanguage() {
    try {
        const lang = localStorage.getItem('rabbithole.voice-language') ?? '';
        return VOICE_LANGUAGES.includes(lang) ? lang : 'en';
    } catch {
        return 'en';
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
        | 'board-speed'
        | 'push-to-talk'
        | 'board-mode'
        | 'check-ins'
        | 'voice-language'
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
