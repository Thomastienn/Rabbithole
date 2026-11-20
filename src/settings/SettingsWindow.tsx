import { useEffect, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav';
import { Icon } from '@astryxdesign/core/Icon';
import {
  ArrowUturnLeftIcon,
  ChartBarIcon,
  CpuChipIcon,
  LinkIcon,
  SwatchIcon,
} from '@heroicons/react/24/outline';
import EndpointSettings from './EndpointSettings';
import SuggestionSettings, { ConceptCost, AutomaticSuggestions } from './SuggestionSettings';
import ChatSettings from './ChatSettings';
import SmartSettings from './SmartSettings';
import ModelProfiles from './ModelProfiles';
import TutorStyleSettings from './TutorStyleSettings';
import MemoryNoteSettings from './MemoryNoteSettings';
import SearchSettings from './SearchSettings';
import TutorToolsSettings from './TutorToolsSettings';
import SandboxSettings from './SandboxSettings';
import UsageDashboard from '../usage/UsageDashboard';
import type { Model } from './models';
import type { ModelSelection } from '../chat/types';
import type { Appearance, ThemeChoice } from '../shell/appearance';
import InterfaceSettings, { Done, Section } from './InterfaceSettings';

export type SettingsTab = 'models' | 'connections' | 'interface' | 'usage';
// tab: the section to scroll to (undefined opens at the top); focus is a selector to focus once open.
export type SettingsRequest = { tab?: SettingsTab; focus?: string };

const TABS: { id: SettingsTab; label: string; description: string; icon: typeof CpuChipIcon }[] = [
  {
    id: 'interface',
    label: 'Interface',
    description: 'How Rabbithole looks and how you move around it. Saved in this browser.',
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

export default function SettingsWindow({
  request,
  close,
  api,
  models,
  providers,
  modelError,
  loadModels,
  profileActivated,
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
  profileActivated: (chat: ModelSelection) => void;
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
          <InterfaceSettings
            appearance={appearance}
            setAppearance={setAppearance}
            theme={theme}
            setTheme={setTheme}
            vim={vim}
            setVim={setVim}
          />,
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
              onActivated={profileActivated}
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
              <ConceptCost tokens={conceptNameTokens} />
            </Section>
            <Divider />
            <TutorToolsSettings api={api} />
            <SandboxSettings api={api} />
            <Divider />
            <TutorStyleSettings api={api} />
            <Divider />
            <MemoryNoteSettings api={api} />
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
              {providers && !modelError && providers.claude?.connected ? (
                <Done>Claude: signed in through Claude Code</Done>
              ) : (
                <Text type="supporting">
                  Claude:{' '}
                  {providers && !modelError
                    ? 'run claude in a terminal and sign in'
                    : 'sign-in status unavailable'}
                </Text>
              )}
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
              {auth?.connected ? (
                <Done>Codex: connected {auth.email ?? 'to ChatGPT'}</Done>
              ) : (
                <Text type="supporting">Codex: not connected</Text>
              )}
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
            <EndpointSettings api={api} models={models} changed={loadModels} />
            <Divider />
            <SearchSettings api={api} />
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
