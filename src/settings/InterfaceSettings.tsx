import { useState, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Switch } from '@astryxdesign/core/Switch';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Icon } from '@astryxdesign/core/Icon';
import {
    CheckIcon,
    ComputerDesktopIcon,
    ExclamationTriangleIcon,
    MoonIcon,
    SunIcon,
} from '@heroicons/react/24/outline';
import {
    applyFont,
    appearances,
    fontChoices,
    savedFont,
    themeChoices,
    type Appearance,
    type FontKind,
    type ThemeChoice,
} from '../shell/appearance';
import { savePreference } from '../shell/preferences';
import { Theme } from '@astryxdesign/core/theme';
import { themes } from '../astryx-themes';

// Swatch diagram (mockup Settings): the trunk, then family lines 1 to 4, and their stations.
const SWATCH_LINES = [
    'M8 24H108',
    'M26 24L40 10H60',
    'M62 24L76 10H108',
    'M26 24L40 38H74',
    'M76 24L90 38H108',
];
const SWATCH_STATIONS = [
    [8, 24],
    [108, 24],
    [60, 10],
    [108, 10],
    [74, 38],
    [108, 38],
];

// Map keys (TreeOverview handlers); Esc is ChatPage's close.
const KEYS: [string, string[]][] = [
    ['Pan the map, or move the focused conversation', ['←', '↑', '↓', '→']],
    ['Move farther', ['Shift', 'arrows']],
    ['Open the focused conversation', ['Enter', 'Space']],
    ['Close Settings', ['Esc']],
];

export function Section({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children?: ReactNode;
}) {
    return (
        <VStack gap={3}>
            <VStack gap={1}>
                <Heading level={3}>{title}</Heading>
                {description && (
                    <Text type="supporting" color="secondary">
                        {description}
                    </Text>
                )}
            </VStack>
            {children}
        </VStack>
    );
}

// Success status reads as ink with a check, never tinted (Line Diagram rule).
export function Done({ children }: { children: ReactNode }) {
    return (
        <Text type="supporting" role="status" className="settings-done">
            <Icon icon={CheckIcon} size="sm" />
            {children}
        </Text>
    );
}

// A problem status: scarlet words with a warning triangle, never colour alone.
export function Problem({ children, role }: { children: ReactNode; role?: 'alert' }) {
    return (
        <Text type="supporting" className="settings-problem" role={role}>
            <Icon icon={ExclamationTriangleIcon} size="sm" />
            {children}
        </Text>
    );
}

// Mockup Settings order: System, Light, Dark, each with its icon.
const APPEARANCE_ICONS = { system: ComputerDesktopIcon, light: SunIcon, dark: MoonIcon };
const BRANCH_INKS = ['First branch', 'Second', 'Third', 'Fourth'];

// Owns its state: the choice lives on <html> and in storage, applied at startup by main.tsx.
function FontChoice({ kind, title }: { kind: FontKind; title: string }) {
    const [font, setFont] = useState(() => savedFont(kind));
    return (
        <Selector
            label={title}
            value={font}
            options={fontChoices[kind].map((f) => ({ value: f.id, label: f.label }))}
            onChange={(value) => {
                setFont(value);
                applyFont(kind, value);
                savePreference(kind, value);
            }}
        />
    );
}

export default function InterfaceSettings({
    appearance,
    setAppearance,
    theme,
    setTheme,
    vim,
    setVim,
}: {
    appearance: Appearance;
    setAppearance: (next: Appearance) => void;
    theme: ThemeChoice;
    setTheme: (next: ThemeChoice) => void;
    vim: boolean;
    setVim: (on: boolean) => void;
}) {
    return (
        <>
            <Section title="Appearance">
                <SegmentedControl
                    label="Appearance"
                    value={appearance}
                    onChange={(value) => setAppearance(value as Appearance)}
                >
                    {[...appearances].reverse().map((a) => (
                        <SegmentedControlItem
                            key={a.id}
                            value={a.id}
                            label={a.label}
                            icon={<Icon icon={APPEARANCE_ICONS[a.id]} size="sm" />}
                        />
                    ))}
                </SegmentedControl>
            </Section>
            <Section title="Theme">
                <fieldset className="theme-tiles">
                    <legend className="sr-only">Theme</legend>
                    {themeChoices.map((t) => (
                        <label key={t.id} className="theme-choice">
                            <input
                                className="sr-only"
                                type="radio"
                                name="theme"
                                value={t.id}
                                checked={theme === t.id}
                                onChange={() => setTheme(t.id)}
                            />
                            {/* Each swatch wears its own theme: a mini line diagram of the trunk and the four family lines. */}
                            <Theme theme={themes[t.id]} mode={appearance}>
                                <span className="theme-tile" data-theme-swatch={t.id}>
                                    <svg viewBox="0 0 116 48" aria-hidden="true">
                                        {SWATCH_LINES.map((d, i) => (
                                            <path
                                                key={d}
                                                d={d}
                                                style={{
                                                    stroke: i
                                                        ? `var(--rabbithole-ink-${i})`
                                                        : 'var(--rabbithole-paper)',
                                                }}
                                            />
                                        ))}
                                        {SWATCH_STATIONS.map(([cx, cy]) => (
                                            <circle key={`${cx} ${cy}`} cx={cx} cy={cy} r="3.5" />
                                        ))}
                                    </svg>
                                    <span className="theme-choice-name">
                                        {t.label}
                                        {theme === t.id && <Icon icon={CheckIcon} size="sm" />}
                                    </span>
                                    <span className="theme-choice-blurb">{t.blurb}</span>
                                </span>
                            </Theme>
                        </label>
                    ))}
                </fieldset>
                <Text type="supporting" color="secondary">
                    A theme sets the ground and the four line colours. Appearance picks its light or
                    dark side.
                </Text>
            </Section>
            <Section title="Fonts">
                <div className="settings-fonts">
                    <FontChoice kind="interface-font" title="Interface font" />
                    <FontChoice kind="reading-font" title="Reading font" />
                </div>
            </Section>
            {/* The four family lines of the current theme; each first-level branch takes the next. */}
            <Section title="Branch family inks">
                <ul className="settings-inks">
                    {BRANCH_INKS.map((name, i) => (
                        <li key={name}>
                            <s style={{ background: `var(--rabbithole-ink-${i + 1})` }} />
                            {name}
                        </li>
                    ))}
                </ul>
                <Text type="supporting" color="secondary">
                    Each branch off the trunk takes the next ink, and every conversation below it
                    keeps that ink.
                </Text>
            </Section>
            <Section title="Keyboard">
                <Switch
                    label="Vim canvas bindings"
                    description="With the map or a conversation box focused: h j k l act as arrows, H J K L move farther, = + - zoom, f fits the tree. Never while typing, selecting text or using menus."
                    value={vim}
                    onChange={setVim}
                />
                <dl className="settings-keys" aria-label="Map keys">
                    {KEYS.map(([action, keys]) => (
                        <div key={action}>
                            <dt>{action}</dt>
                            <dd>
                                {keys.map((k) => (
                                    <kbd key={k}>{k}</kbd>
                                ))}
                            </dd>
                        </div>
                    ))}
                </dl>
            </Section>
        </>
    );
}
