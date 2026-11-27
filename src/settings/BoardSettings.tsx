import { useState } from 'react';
import { Switch } from '@astryxdesign/core/Switch';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Section } from './InterfaceSettings';
import Choice from './Choice';
import { savePreference, savedPushToTalk, savedTutorGuided } from '../shell/preferences';

const MODES = [
    { value: 'learner', label: 'Learner-led' },
    { value: 'guided', label: 'Tutor-guided' },
];

// The Board page (mockups Rabbithole-brd.12 and brd.13): how the tutor talks and listens on a board.
export default function BoardSettings() {
    const [pushToTalk, setPushToTalk] = useState(savedPushToTalk);
    const [mode, setMode] = useState(() => (savedTutorGuided() ? 'guided' : 'learner'));
    return (
        <>
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
            <Section title="How the board runs">
                <VStack gap={2}>
                    <Choice
                        label="How the board runs"
                        isLabelHidden
                        value={mode}
                        options={MODES}
                        onChange={(next) => {
                            setMode(next);
                            savePreference('board-mode', next);
                        }}
                    />
                    <Text type="supporting" color="secondary">
                        {mode === 'guided'
                            ? 'The tutor also checks in with short questions, and gives a hint if you stay quiet. Answers are never graded.'
                            : 'The tutor explains and keeps going. You ask whenever something is unclear.'}
                    </Text>
                    <Text type="supporting" color="secondary">
                        On any board, say or type "quiz me as we go" or "stop asking" to switch just
                        that board.
                    </Text>
                </VStack>
            </Section>
        </>
    );
}
