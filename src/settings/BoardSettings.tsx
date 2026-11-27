import { useState } from 'react';
import { Switch } from '@astryxdesign/core/Switch';
import { Section } from './InterfaceSettings';
import { savePreference, savedPushToTalk } from '../shell/preferences';

// The Board page (mockup Rabbithole-brd.12): how the tutor talks and listens on a board.
export default function BoardSettings() {
    const [pushToTalk, setPushToTalk] = useState(savedPushToTalk);
    return (
        <Section title="Voice">
            <Switch
                label="Push-to-talk"
                description="Hold Space or the mic button while you speak, and let go to send. Useful in a noisy room or with speakers. When it's off, the mic listens hands-free once you turn it on."
                value={pushToTalk}
                onChange={(on) => {
                    setPushToTalk(on);
                    savePreference('push-to-talk', on ? 'on' : 'off');
                }}
            />
        </Section>
    );
}
