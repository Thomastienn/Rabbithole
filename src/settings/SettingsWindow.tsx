import { useEffect, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { Banner } from '@astryxdesign/core/Banner';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav';
import { Icon } from '@astryxdesign/core/Icon';
import {
  ArrowUturnLeftIcon,
  ChartBarIcon,
  CheckIcon,
  CpuChipIcon,
  LinkIcon,
  SwatchIcon,
} from '@heroicons/react/24/outline';
import EndpointSettings from './EndpointSettings';
import SuggestionSettings from './SuggestionSettings';
import ChatSettings from './ChatSettings';
import SmartSettings from './SmartSettings';
import ModelProfiles, { AutomaticSuggestions } from './ModelProfiles';
import UsageDashboard from '../usage/UsageDashboard';
import type { Model } from './models';
import { appearances, themeChoices, type Appearance, type ThemeChoice } from '../shell/appearance';
import { Theme } from '@astryxdesign/core/theme';
import { themes } from '../shell/astryx-themes';

export type SettingsTab = 'models' | 'connections' | 'interface' | 'usage';
// tab: the section to scroll to (undefined opens at the top); focus is a selector to focus once open.
export type SettingsRequest = { tab?: SettingsTab; focus?: string };

const TABS: { id: SettingsTab; label: string; description: string; icon: typeof CpuChipIcon }[] = [
  {
    id: 'interface',
    label: 'Interface',
    description: 'How TreeTutor looks and how you move around it. Saved in this browser.',
    icon: SwatchIcon,
  },
  {
    id: 'models',
    label: 'Models',
    description:
      'A profile holds a model and effort for each role. Swapping profiles changes all three at once.',
    icon: CpuChipIcon,
  },
  {
    id: 'connections',
    label: 'Connections',
    description:
      'Providers that answer your questions. Trees save on this computer; questions go to the provider you pick for each conversation.',
    icon: LinkIcon,
  },
  {
    id: 'usage',
    label: 'Usage',
    description:
      'Tokens providers reported for replies, suggestions and media. Kept even after content is deleted.',
    icon: ChartBarIcon,
  },
];

// Map keys (TreeOverview handlers); Esc is ChatPage's close.
const KEYS: [string, string[]][] = [
  ['Pan the map, or move the focused conversation', ['←', '↑', '↓', '→']],
  ['Move farther', ['Shift', 'arrows']],
  ['Open the focused conversation', ['Enter', 'Space']],
  ['Close Settings', ['Esc']],
];

function Section({
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

export default function SettingsWindow({
  request,
  close,
  api,
  models,
  providers,
  modelError,
  loadModels,
  conceptNameTokens,
  auth,
  signIn,
  vim,
  setVim,
  appearance,
  setAppearance,
  theme,
  setTheme,
}: {
  request?: SettingsRequest;
  close: () => void;
  api: (path: string, body?: unknown) => Promise<any>;
  models?: Model[];
  providers?: Record<string, { label: string; connected: boolean }>;
  modelError: string;
  loadModels: () => Promise<void>;
  conceptNameTokens?: number;
  auth?: { connected: boolean; email: string | null };
  signIn: () => Promise<void>;
  vim: boolean;
  setVim: (on: boolean) => void;
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  theme: ThemeChoice;
  setTheme: (next: ThemeChoice) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>('interface');
  const [authError, setAuthError] = useState('');
  const [chatVersion, setChatVersion] = useState(0),
    [rolesVersion, setRolesVersion] = useState(0);
  // Scroll to a section (or a control inside it) and focus it; no section means the page title.
  function reveal(target: string) {
    const el = document.querySelector<HTMLElement>(target);
    el?.scrollIntoView({ block: 'start' });
    el?.focus({ preventScroll: true });
  }
  // Switch page during render so the focus effect below finds the requested page already mounted.
  const [seen, setSeen] = useState(request);
  if (request !== seen) {
    setSeen(request);
    if (request) {
      setTab(request.tab ?? 'interface');
      setAuthError('');
    }
  }
  useEffect(() => {
    if (!request) return;
    const focus = () =>
      reveal(
        request.focus ?? (request.tab ? `#settings-section-${request.tab}` : '#settings-heading'),
      );
    // The modal drawer keeps the page inert until its closing transition finishes.
    const drawer = document.querySelector('dialog.astryx-drawer[open]');
    if (drawer) {
      drawer.addEventListener('close', focus, { once: true });
      return () => drawer.removeEventListener('close', focus);
    }
    const frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [request]);
  function showTab(next: SettingsTab) {
    setTab(next);
    requestAnimationFrame(() => reveal(`#settings-section-${next}`));
  }
  async function connect() {
    setAuthError('');
    try {
      await signIn();
    } catch (e) {
      setAuthError((e as Error).message);
    }
  }
  const group = (id: SettingsTab, children: ReactNode) => {
    const t = TABS.find((t) => t.id === id)!;
    return (
      <VStack
        gap={6}
        as="section"
        className="settings-group"
        aria-labelledby={`settings-section-${id}`}
      >
        <VStack gap={1}>
          <Heading level={2} id={`settings-section-${id}`} tabIndex={-1}>
            {t.label}
          </Heading>
          <Text type="supporting" color="secondary">
            {t.description}
          </Text>
        </VStack>
        {children}
      </VStack>
    );
  };

  // One page at a time (mockup Settings); the nav picks the page.
  const panel = (
    <VStack gap={8} className="settings-panel">
      {tab === 'usage' && group('usage', <UsageDashboard api={api} providers={providers} />)}
      {tab === 'interface' &&
        group(
          'interface',
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
                            <i key={n} style={{ background: `var(--treetutor-ink-${n})` }} />
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
          </>,
        )}
      {tab === 'models' &&
        group(
          'models',
          <>
            <ModelProfiles
              api={api}
              models={models}
              providers={providers}
              modelError={modelError}
              reloadModels={loadModels}
              connections={() => showTab('connections')}
              version={rolesVersion}
            >
              <ChatSettings
                api={api}
                models={models}
                providers={providers}
                onSaved={() => {
                  setChatVersion((v) => v + 1);
                  setRolesVersion((v) => v + 1);
                }}
              />
              <SmartSettings
                api={api}
                models={models}
                providers={providers}
                chatVersion={chatVersion}
                onSaved={() => setRolesVersion((v) => v + 1)}
              />
              <SuggestionSettings
                api={api}
                models={models}
                providers={providers}
                onSaved={() => setRolesVersion((v) => v + 1)}
              />
            </ModelProfiles>
            <Divider />
            <Section title="Suggestions">
              <AutomaticSuggestions api={api} />
            </Section>
            <Divider />
            <Section
              title="Concept matching"
              description="Each suggestion call also sends your known concept names so it can match terms to them. A warning appears here when that list passes about 2,000 tokens."
            >
              {(conceptNameTokens ?? 0) > 2000 ? (
                <Banner
                  status="warning"
                  title="Warning: concept matching is getting expensive"
                  description={`The last suggestion call sent about ${conceptNameTokens!.toLocaleString()} tokens of concept names.`}
                />
              ) : (
                <Text type="supporting">Concept matching cost is within the normal range.</Text>
              )}
            </Section>
          </>,
        )}
      {tab === 'connections' &&
        group(
          'connections',
          <>
            <Section
              title="Claude"
              description="Uses your own Claude plan through Claude Code on this computer."
            >
              <Text type="supporting">
                Claude:{' '}
                {providers && !modelError
                  ? providers.claude?.connected
                    ? 'signed in through Claude Code'
                    : 'run claude in a terminal and sign in'
                  : 'sign-in status unavailable'}
              </Text>
              {modelError && (
                <Text type="supporting" role="alert">
                  {modelError}
                </Text>
              )}
              {!providers?.claude?.connected && (
                <HStack>
                  <Button
                    label="Check Claude sign-in"
                    variant="secondary"
                    size="sm"
                    onClick={() => void loadModels()}
                  />
                </HStack>
              )}
            </Section>
            <Divider />
            <Section title="Codex" description="Uses your own ChatGPT plan.">
              <Text type="supporting">
                Codex:{' '}
                {auth?.connected ? `connected ${auth.email ?? 'to ChatGPT'}` : 'not connected'}
              </Text>
              <HStack>
                <Button
                  label={auth?.connected ? 'Reconnect ChatGPT' : 'Continue with ChatGPT'}
                  variant="secondary"
                  size="sm"
                  data-oai-siwc-button=""
                  onClick={() => void connect()}
                >
                  {auth?.connected ? 'Reconnect ChatGPT' : 'Continue with ChatGPT'}
                </Button>
              </HStack>
              {authError && (
                <Text type="supporting" role="alert">
                  {authError}
                </Text>
              )}
            </Section>
            <Divider />
            <EndpointSettings api={api} changed={() => void loadModels()} />
          </>,
        )}
    </VStack>
  );

  const nav = (
    <SideNav aria-label="Settings sections" className="settings-nav">
      {TABS.map((t) => (
        <SideNavItem
          key={t.id}
          id={`settings-${t.id}`}
          label={t.label}
          icon={<Icon icon={t.icon} size="sm" color="primary" />}
          isSelected={t.id === tab}
          onClick={() => showTab(t.id)}
        />
      ))}
    </SideNav>
  );

  // A full page, not a dialog (mockup Settings, Usage); ChatPage maps Escape to close like the old window.
  return (
    <main hidden={!request} className="knowledge-panel settings-page" aria-label="Settings">
      {request && (
        <VStack gap={8} className="settings-content">
          <HStack gap={4} vAlign="end" hAlign="between" wrap="wrap" className="settings-head">
            <Heading level={1} id="settings-heading" tabIndex={-1}>
              Settings
            </Heading>
            <Button
              id="settings-return"
              label="Return to learning tree"
              variant="secondary"
              icon={<ArrowUturnLeftIcon />}
              onClick={close}
            />
          </HStack>
          <div className="settings-layout">
            {nav}
            {panel}
          </div>
        </VStack>
      )}
    </main>
  );
}
