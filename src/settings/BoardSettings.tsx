import { useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Switch } from '@astryxdesign/core/Switch';
import { Selector } from '@astryxdesign/core/Selector';
import { Section } from './InterfaceSettings';
import Choice from './Choice';
import {
    savePreference,
    savedCheckIns,
    savedPushToTalk,
    savedTutorGuided,
    savedVoiceLanguage,
    VOICE_LANGUAGES,
} from '../shell/preferences';
import { request as api } from '../serverAccess';

const names = new Intl.DisplayNames(['en'], { type: 'language' });
// English first, then the rest by name.
const languages = VOICE_LANGUAGES.map((value) => ({ value, label: names.of(value) ?? value })).sort(
    (a, b) => Number(b.value === 'en') - Number(a.value === 'en') || a.label.localeCompare(b.label),
);

const MODES = [
    { value: 'learner', label: 'Learner-led' },
    { value: 'guided', label: 'Tutor-guided' },
];

const CHECK_INS = [
    { value: 'off', label: 'Off' },
    { value: 'sometimes', label: 'Now and then' },
    { value: 'often', label: 'Often' },
];

// The Board page (mockups Rabbithole-brd.12 and brd.13): how the tutor talks and listens on a board.
export default function BoardSettings() {
    const [pushToTalk, setPushToTalk] = useState(savedPushToTalk);
    const [mode, setMode] = useState(() => (savedTutorGuided() ? 'guided' : 'learner'));
    const [lang, setLang] = useState(savedVoiceLanguage);
    const [checkIns, setCheckIns] = useState<string>(savedCheckIns);
    // Whether the chosen language's speech models are on this computer; English needs no line either way.
    const [downloaded, setDownloaded] = useState(true);
    useEffect(() => {
        if (lang === 'en') return setDownloaded(true);
        let live = true;
        setDownloaded(true);
        api(`/api/settings/voice-models?lang=${lang}`)
            .then((r: { downloaded: boolean }) => live && setDownloaded(r.downloaded))
            .catch(() => {});
        return () => {
            live = false;
        };
    }, [lang]);
    return (
        <>
            <Section title="Voice">
                <VStack gap={2} className="settings-voice-lang">
                    <Selector
                        label="Voice language"
                        width={300}
                        placement="below"
                        indicatorPosition="start"
                        value={lang}
                        options={languages}
                        onChange={(value) => {
                            setLang(value);
                            savePreference('voice-language', value);
                        }}
                    />
                    <Text type="supporting" color="secondary">
                        The language you speak on a board. The tutor answers in it too, in a voice
                        made for it.
                    </Text>
                    {!downloaded && (
                        <Text type="supporting" color="secondary">
                            {names.of(lang)} needs a larger speech model, about 77 MB. It downloads
                            the next time you press the mic on a board.
                        </Text>
                    )}
                </VStack>
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
                            ? 'The tutor also asks short questions, and gives a hint if you stay quiet. Answers are never graded.'
                            : 'The tutor explains and keeps going. You ask whenever something is unclear.'}
                    </Text>
                    <Text type="supporting" color="secondary">
                        On any board, say or type "quiz me as we go" or "stop asking" to switch just
                        that board.
                    </Text>
                </VStack>
                <Choice
                    label="Check-ins"
                    description='The tutor asks whether you are following and waits for you; never a quiz. On any board, say or type "stop checking in" or "check on me more" to switch just that board.'
                    value={checkIns}
                    options={CHECK_INS}
                    onChange={(next) => {
                        setCheckIns(next);
                        savePreference('check-ins', next);
                    }}
                />
            </Section>
        </>
    );
}
