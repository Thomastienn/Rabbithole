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
import { ArrowUturnLeftIcon, ChartBarIcon, CpuChipIcon, LinkIcon, SwatchIcon } from '@heroicons/react/24/outline';
import EndpointSettings from './EndpointSettings';
import SuggestionSettings from './SuggestionSettings';
import ChatSettings from './ChatSettings';
import SmartSettings from './SmartSettings';
import UsageDashboard from './UsageDashboard';
import type { Model } from './models';
import { bubbleTints, type BubbleTint } from './bubbleTint';
import { appearances, type Appearance } from './appearance';

export type SettingsTab = 'models' | 'connections' | 'interface' | 'usage';
// tab: the section to scroll to (undefined opens at the top); focus is a selector to focus once open.
export type SettingsRequest = { tab?: SettingsTab; focus?: string };

const TABS: { id: SettingsTab; label: string; description: string; icon: typeof CpuChipIcon }[] = [
  { id: 'interface', label: 'Interface', description: 'Appearance, question bubble tint, keyboard controls and help for the map.', icon: SwatchIcon },
  { id: 'models', label: 'Models', description: 'Chat default, smart and quick thinking roles, and concept matching.', icon: CpuChipIcon },
  { id: 'connections', label: 'Connections', description: 'Providers that answer your questions. Trees save on this computer; questions go to the provider you pick for each conversation.', icon: LinkIcon },
  { id: 'usage', label: 'Usage', description: 'Tokens providers reported for replies and suggestions, kept even after content is deleted.', icon: ChartBarIcon },
];

function Section({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <VStack gap={3}>
    <VStack gap={1}><Heading level={3}>{title}</Heading>{description && <Text type="supporting" color="secondary">{description}</Text>}</VStack>
    {children}
  </VStack>;
}

export default function SettingsWindow({ request, close, api, models, providers, modelError, loadModels, conceptNameTokens, auth, signIn, vim, setVim, appearance, setAppearance, bubbleTint, setBubbleTint }: {
  request?: SettingsRequest;
  close: () => void;
  api: (path: string, body?: unknown) => Promise<any>;
  models?: Model[];
  providers?: Record<string, { connected: boolean }>;
  modelError: string;
  loadModels: () => Promise<void>;
  conceptNameTokens?: number;
  auth?: { connected: boolean; email: string | null };
  signIn: () => Promise<void>;
  vim: boolean;
  setVim: (on: boolean) => void;
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  bubbleTint: BubbleTint;
  setBubbleTint: (tint: BubbleTint) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>('interface');
  const [authError, setAuthError] = useState('');
  const [chatVersion, setChatVersion] = useState(0);
  // Scroll to a section (or a control inside it) and focus it; no section means the page title.
  function reveal(target: string) {
    const el = document.querySelector<HTMLElement>(target);
    el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!request) return;
    setTab(request.tab ?? 'interface'); setAuthError('');
    const focus = () => reveal(request.focus ?? (request.tab ? `#settings-section-${request.tab}` : '#settings-heading'));
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
    try { await signIn(); }
    catch (e) { setAuthError((e as Error).message); }
  }
  const group = (id: SettingsTab, children: ReactNode) => {
    const t = TABS.find(t => t.id === id)!;
    return <VStack gap={6} as="section" className="settings-group" aria-labelledby={`settings-section-${id}`}>
      <VStack gap={1}><Heading level={2} id={`settings-section-${id}`} tabIndex={-1}>{t.label}</Heading><Text type="supporting" color="secondary">{t.description}</Text></VStack>
      {children}
    </VStack>;
  };

  const panel = <VStack gap={10} className="settings-panel">
    {tab === 'usage' ? group('usage', <Section title="Usage history"><UsageDashboard api={api} /></Section>) : <>
    {group('interface', <>
      <Section title="Appearance" description="Dark, light, or System to follow your operating system. Saved in this browser.">
        <RadioList label="Appearance" isLabelHidden value={appearance} onChange={value => setAppearance(value as Appearance)}>
          {appearances.map(a => <RadioListItem key={a.id} value={a.id} label={a.label} />)}
        </RadioList>
      </Section>
      <Divider />
      <Section title="Question bubbles" description="Choose a tint for your questions. Saved in this browser; follows your appearance.">
        <RadioList label="Bubble tint" isLabelHidden value={bubbleTint} onChange={value => setBubbleTint(value as BubbleTint)}>
          {bubbleTints.map(tint => <RadioListItem key={tint.id} value={tint.id} label={tint.label} startContent={<HStack aria-hidden="true" className="bubble-tint-swatch" style={{ background: tint.color }} />} />)}
        </RadioList>
        <VStack gap={2} role="group" aria-label="Question bubble preview">
          <Text type="supporting" color="secondary">Preview</Text>
          <HStack hAlign="end"><Text className="question-bubble">How does this connect to what I already know?</Text></HStack>
        </VStack>
      </Section>
      <Divider />
      <Section title="Vim canvas bindings" description="Optional letter keys for moving around the map.">
        <CheckboxInput label="Vim canvas bindings" description="With the map or a conversation box focused, h j k l act as arrows; = + - zoom; f fits the tree." value={vim} onChange={setVim} />
      </Section>
      <Divider />
      <Section title="Map help">
        <Text>Focus the map and use arrow keys to pan. Focus a conversation and use arrows to move it; hold Shift to move farther.</Text>
        <Text>Vim canvas bindings are {vim ? 'on' : 'off'}; change them above. When on, with the map or a conversation box itself focused: h, j, k and l act as the left, down, up and right arrows (H, J, K, L move farther); = or + zooms in, - zooms out and f fits the tree. They never apply while typing, selecting text or using menus.</Text>
        <Text>In Settings → Connections, save one custom endpoint’s base URL and API key, test its model listing, or remove it. Its owner bills requests sent there. The saved key is never shown. In chat, open Model for next reply and use arrows and Enter to choose Claude, Codex or a custom endpoint model and supported effort. Switching preserves the discussion and inherited context; children start with their parent’s choice. Set the starting model and effort for new learning trees in Settings → Models.</Text>
      </Section>
    </>)}
    {group('models', <>
      <ChatSettings api={api} models={models} providers={providers} modelError={modelError} reloadModels={loadModels} connections={() => showTab('connections')} onSaved={() => setChatVersion(v => v + 1)} />
      <Divider />
      <SmartSettings api={api} models={models} providers={providers} chatVersion={chatVersion} />
      <Divider />
      <SuggestionSettings api={api} models={models} providers={providers} modelError={modelError} reloadModels={loadModels} />
      <Divider />
      <Section title="Concept matching" description="Each suggestion call also sends your known concept names so it can match terms to them. A warning appears here when that list passes about 2,000 tokens.">
        {(conceptNameTokens ?? 0) > 2000
          ? <Banner status="warning" title="Warning: concept matching is getting expensive" description={`The last suggestion call sent about ${conceptNameTokens!.toLocaleString()} tokens of concept names.`} />
          : <Text type="supporting">Concept matching cost is within the normal range.</Text>}
      </Section>
    </>)}
    {group('connections', <>
      <Section title="Claude" description="Uses your own Claude plan through Claude Code on this computer.">
        <Text type="supporting">Claude: {providers ? providers.claude?.connected ? 'signed in through Claude Code' : 'run claude in a terminal and sign in' : 'sign-in status unavailable'}</Text>
        {modelError && <Text type="supporting" role="alert">{modelError}</Text>}
        {!providers?.claude?.connected && <HStack><Button label="Check Claude sign-in" variant="secondary" size="sm" onClick={() => void loadModels()} /></HStack>}
      </Section>
      <Divider />
      <Section title="Codex" description="Uses your own ChatGPT plan.">
        <Text type="supporting">Codex: {auth?.connected ? `connected ${auth.email ?? 'to ChatGPT'}` : 'not connected'}</Text>
        <HStack><Button label={auth?.connected ? 'Reconnect ChatGPT' : 'Continue with ChatGPT'} variant="secondary" size="sm" data-oai-siwc-button="" onClick={() => void connect()}>{auth?.connected ? 'Reconnect ChatGPT' : 'Continue with ChatGPT'}</Button></HStack>
        {authError && <Text type="supporting" role="alert">{authError}</Text>}
      </Section>
      <Divider />
      <EndpointSettings api={api} changed={() => void loadModels()} />
    </>)}
    </>}
  </VStack>;

  const nav = <SideNav aria-label="Settings sections" className="settings-nav">
    {TABS.map(t => <SideNavItem key={t.id} id={`settings-${t.id}`} label={t.label} icon={<Icon icon={t.icon} size="sm" color="primary" />} isSelected={t.id === tab} onClick={() => showTab(t.id)} />)}
  </SideNav>;

  // A full page, not a dialog (mockup Settings, Usage); ChatPage maps Escape to close like the old window.
  return <main hidden={!request} className="knowledge-panel settings-page" aria-label="Settings">
    {request && <VStack gap={8} className="settings-content">
      <HStack gap={4} vAlign="end" hAlign="between" wrap="wrap" className="settings-head">
        <Heading level={1} id="settings-heading" tabIndex={-1}>Settings</Heading>
        <Button id="settings-return" label="Return to learning tree" variant="secondary" icon={<ArrowUturnLeftIcon />} onClick={close} />
      </HStack>
      <div className="settings-layout">{nav}{panel}</div>
    </VStack>}
  </main>;
}
