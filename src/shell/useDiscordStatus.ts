import { useEffect, useState } from 'react';
import { savedDiscordStatus, savePreference } from './preferences';

// The desktop app shows the open tree as the Discord status (desktop/discord.mjs); false clears it, and a browser
// has no bridge. Returns the saved switch and a setter that saves it.
export function useDiscordStatus(treeTitle: string | null) {
    const [discord, setDiscord] = useState(savedDiscordStatus);
    useEffect(() => {
        (
            window as { rabbitholeDesktop?: { activity?: (t: string | null | false) => void } }
        ).rabbitholeDesktop?.activity?.(discord && treeTitle);
    }, [discord, treeTitle]);
    return [
        discord,
        (on: boolean) => {
            setDiscord(on);
            savePreference('discord-status', on ? 'on' : 'off');
        },
    ] as const;
}
