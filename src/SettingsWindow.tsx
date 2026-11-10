import { useEffect, useState, type ReactNode } from 'react';
import { HStack, VStack, Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Divider } from '@astryxdesign/core/Divider';
import { Banner } from '@astryxdesign/core/Banner';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav';
import { Icon } from '@astryxdesign/core/Icon';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { ArrowLeftIcon, ChartBarIcon, CpuChipIcon, LinkIcon, SwatchIcon, XMarkIcon } from '@heroicons/react/24/outline';
import EndpointSettings from './EndpointSettings';
import SuggestionSettings from './SuggestionSettings';
import { bubbleTints, type BubbleTint } from './bubbleTint';

export type SettingsTab = 'models' | 'connections' | 'interface' | 'usage';
// tab: undefined opens the default tab on desktop and the tab list on mobile; focus is a selector to focus once open.
export type SettingsRequest = { tab?: SettingsTab; focus?: string };
type Model = { provider: string; model: string; label: string };

const TABS: { id: SettingsTab; label: string; description: string; icon: typeof CpuChipIcon }[] = [
  { id: 'models', label: 'Models', description: 'Which model picks suggestion underlines, and what concept matching costs.', icon: CpuChipIcon },
  { id: 'connections', label: 'Connections', description: 'Providers that answer your questions. Trees save on this computer; questions go to the provider you pick for each conversation.', icon: LinkIcon },
  { id: 'interface', label: 'Interface', description: 'Question bubble tint, keyboard controls and help for the map.', icon: SwatchIcon },
  { id: 'usage', label: 'Usage', description: 'What today’s replies and suggestions have used so far.', icon: ChartBarIcon },
];

function Section({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <VStack gap={3}>
    <VStack gap={1}><Heading level={3}>{title}</Heading>{description && <Text type="supporting" color="secondary">{description}</Text>}</VStack>
    {children}
  </VStack>;
}

export default function SettingsWindow({ request, close, api, models, providers, modelError, loadModels, usage, conceptNameTokens, auth, signIn, vim, setVim, bubbleTint, setBubbleTint }: {
  request?: SettingsRequest;
  close: () => void;
  api: (path: string, body?: unknown) => Promise<any>;
  models?: Model[];
  providers?: Record<string, { connected: boolean }>;
  modelError: string;
  loadModels: () => Promise<void>;
  usage?: string;
  conceptNameTokens?: number;
  auth?: { connected: boolean; email: string | null };
  signIn: () => Promise<void>;
  vim: boolean;
  setVim: (on: boolean) => void;
  bubbleTint: BubbleTint;
  setBubbleTint: (tint: BubbleTint) => void;
}) {
  const narrow = useMediaQuery('(max-width: 48rem)');
  const [tab, setTab] = useState<SettingsTab>();
  const [authError, setAuthError] = useState('');
  useEffect(() => {
    if (!request) return;
    setTab(request.tab); setAuthError('');
    // After the dialog's own initial focus, move to the requested control or the title.
    const timer = setTimeout(() => document.querySelector<HTMLElement>(request.focus ?? '#settings-heading')?.focus(), 50);
    return () => clearTimeout(timer);
  }, [request]);
  const shown = tab ?? (narrow ? undefined : 'models');
  const current = TABS.find(t => t.id === shown);
  function showTab(next?: SettingsTab) {
    setTab(next);
    if (narrow) requestAnimationFrame(() => document.querySelector<HTMLElement>(next ? '#settings-section-heading' : `#settings-${tab}`)?.focus());
  }
  async function connect() {
    setAuthError('');
    try { await signIn(); }
    catch (e) { setAuthError((e as Error).message); }
  }
  const closeButton = <IconButton label="Close settings" icon={<XMarkIcon />} variant="ghost" size="sm" onClick={close} />;

  const panel = current && <VStack gap={6}>
    <HStack gap={2} vAlign="start" hAlign="between">
      <VStack gap={1}><Heading level={2} id="settings-section-heading" tabIndex={-1}>{current.label}</Heading><Text type="supporting" color="secondary">{current.description}</Text></VStack>
      {!narrow && closeButton}
    </HStack>
    {current.id === 'models' && <>
      <SuggestionSettings api={api} models={models} providers={providers} modelError={modelError} reloadModels={loadModels} />
      <Divider />
      <Section title="Concept matching" description="Each suggestion call also sends your known concept names so it can match terms to them. A warning appears here when that list passes about 2,000 tokens.">
        {(conceptNameTokens ?? 0) > 2000
          ? <Banner status="warning" title="Warning: concept matching is getting expensive" description={`The last suggestion call sent about ${conceptNameTokens!.toLocaleString()} tokens of concept names.`} />
          : <Text type="supporting">Concept matching cost is within the normal range.</Text>}
      </Section>
    </>}
    {current.id === 'connections' && <>
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
    </>}
    {current.id === 'interface' && <>
      <Section title="Question bubbles" description="Choose a tint for your questions. Saved in this browser; follows your light or dark theme.">
        <RadioList label="Bubble tint" value={bubbleTint} onChange={value => setBubbleTint(value as BubbleTint)}>
          {bubbleTints.map(tint => <RadioListItem key={tint.id} value={tint.id} label={tint.label} endContent={<HStack aria-hidden="true" className="bubble-tint-swatch" style={{ background: tint.color }} />} />)}
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
        <Text>In Settings → Connections, save one custom endpoint’s base URL and API key, test its model listing, or remove it. Its owner bills requests sent there. The saved key is never shown. In chat, open Model for next reply and use arrows and Enter to choose Claude, Codex or a custom endpoint model. Switching preserves the discussion and inherited context; children start with their parent’s choice. New chats default to Claude.</Text>
      </Section>
    </>}
    {current.id === 'usage' && <Section title="Today" description="Tokens and cost reported by providers for replies and suggestions since midnight.">
      <Text type="supporting">Today's usage: {usage ?? 'no reported usage yet'}</Text>
    </Section>}
  </VStack>;

  const nav = <SideNav aria-label="Settings sections" header={<HStack padding={2} vAlign="center" hAlign="between">
    <Heading level={1} id="settings-heading" tabIndex={-1}>Settings</Heading>{narrow && closeButton}
  </HStack>}>
    {TABS.map(t => <SideNavItem key={t.id} id={`settings-${t.id}`} label={t.label} icon={<Icon icon={t.icon} size="sm" color="primary" />} isSelected={!narrow && t.id === shown} onClick={() => showTab(t.id)} />)}
  </SideNav>;

  return <Dialog isOpen={!!request} onOpenChange={open => { if (!open) close(); }} width="min(60rem, calc(100vw - 2rem))" maxHeight="min(50rem, calc(100dvh - 2rem))" variant={narrow ? 'fullscreen' : 'standard'} padding={0} aria-labelledby="settings-heading">
    {narrow
      ? <VStack gap={0} className="settings-shell">{current
        ? <>
          <HStack padding={2} gap={2} vAlign="center" hAlign="between">
            <Button label="All settings" variant="ghost" size="sm" icon={<ArrowLeftIcon />} onClick={() => showTab()}>All settings</Button>
            <Heading level={1} id="settings-heading" tabIndex={-1} className="sr-only">Settings</Heading>
            {closeButton}
          </HStack>
          <Divider />
          <Layout content={<LayoutContent isScrollable padding={4}>{panel}</LayoutContent>} />
        </>
        : nav}</VStack>
      : <VStack gap={0} className="settings-shell"><Layout start={nav} content={<LayoutContent isScrollable padding={6}>{panel}</LayoutContent>} /></VStack>}
  </Dialog>;
}
