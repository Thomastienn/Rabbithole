import type { ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Divider } from '@astryxdesign/core/Divider';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Icon } from '@astryxdesign/core/Icon';
import { CheckIcon } from '@heroicons/react/24/outline';
import { appearances, themeChoices, type Appearance, type ThemeChoice } from '../shell/appearance';
import { Theme } from '@astryxdesign/core/theme';
import { themes } from '../shell/astryx-themes';

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
      <Section
        title="Appearance"
        description="Dark, light, or System to follow your operating system. Saved in this browser."
      >
        <RadioList
          label="Appearance"
          isLabelHidden
          value={appearance}
          onChange={(value) => setAppearance(value as Appearance)}
        >
          {appearances.map((a) => (
            <RadioListItem key={a.id} value={a.id} label={a.label} />
          ))}
        </RadioList>
      </Section>
      <Divider />
      <Section
        title="Theme"
        description="Colours for the whole app, including your question bubbles and the four branch inks. Shown in your appearance's variant. Saved in this browser."
      >
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
              {/* Each tile wears its own theme: ground, question bubble, a reply line, the action colour and the four branch inks. */}
              <Theme theme={themes[t.id]} mode={appearance}>
                <span aria-hidden="true" className="theme-tile" data-theme-swatch={t.id}>
                  <i className="theme-tile-bubble" />
                  <i className="theme-tile-line" />
                  <span className="theme-tile-inks">
                    <i style={{ background: 'var(--color-accent)' }} />
                    {[1, 2, 3, 4].map((n) => (
                      <i key={n} style={{ background: `var(--rabbithole-ink-${n})` }} />
                    ))}
                  </span>
                </span>
              </Theme>
              <HStack gap={1} vAlign="center" className="theme-choice-name">
                <Text weight="semibold">{t.label}</Text>
                {theme === t.id && <Icon icon={CheckIcon} size="sm" />}
              </HStack>
            </label>
          ))}
        </fieldset>
      </Section>
      <Divider />
      <Section title="Keyboard">
        <CheckboxInput
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
