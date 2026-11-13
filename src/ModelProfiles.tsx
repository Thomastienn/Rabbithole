import { useEffect, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Button } from '@astryxdesign/core/Button';
import type { Model, ChatSelection } from './models';

type Pin = Pick<Model, 'provider' | 'model'> | null;
type Profile = { id: string; name: string; chat: ChatSelection; smart: { model: Pin }; quick: { model: Pin } };

// Profile picker above the role table; swapping remounts the role rows so each reloads from the newly active profile.
export default function ModelProfiles({ api, models, providers, modelError, reloadModels, connections, version, children }: {
  api: (path: string, body?: unknown) => Promise<any>;
  models?: Model[];
  providers?: Record<string, { label: string; connected: boolean }>;
  modelError: string;
  reloadModels: () => Promise<void>;
  connections: () => void;
  version: number;
  children: ReactNode;
}) {
  const [list, setList] = useState<{ active: string; profiles: Profile[] }>();
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false);
  async function run(task: Promise<{ active: string; profiles: Profile[] }>) {
    setPending(true); setError('');
    try { setList(await task); }
    catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  async function refresh() {
    setRefreshing(true);
    try { await reloadModels(); } finally { setRefreshing(false); }
  }
  useEffect(() => { void run(api('/api/profiles')); }, [version]);
  useEffect(() => { void refresh(); }, []);
  const name = (pin: ChatSelection | Pin) => {
    if (!pin) return '';
    const m = models?.find(m => providers?.[m.provider]?.connected && m.provider === pin.provider && (pin.model ? m.model === pin.model : m.isDefault));
    return m ? m.label : `${providers?.[pin.provider]?.label ?? pin.provider} ${pin.model ?? 'default model'}${models ? ' (unavailable)' : ''}`;
  };
  const summary = (p: Profile) => [name(p.chat), p.smart.model ? name(p.smart.model) : 'follows chat', p.quick.model ? name(p.quick.model) : 'default quick thinking'].join(' · ');
  const active = list?.profiles.find(p => p.id === list.active);
  return <VStack gap={4}>
    <HStack className="settings-profile" gap={3} vAlign="center" wrap="wrap">
      <Selector label="Model profile" isLabelHidden value={list?.active ?? ''} size="sm" isDisabled={!list || pending} options={(list?.profiles ?? []).map(p => ({ value: p.id, label: p.name, description: summary(p) }))}
        onChange={id => { if (id !== list?.active) void run(api('/api/profiles/active', { id })); }} />
      <Text type="supporting" color="secondary">New learning trees, visuals and suggestions use this profile. Conversations you already started keep their model.</Text>
    </HStack>
    {error && <Text type="supporting" role="alert">{error}</Text>}
    {!list && !pending && <HStack><Button label="Retry loading profiles" size="sm" variant="ghost" onClick={() => void run(api('/api/profiles'))} /></HStack>}
    {list && <div role="table" aria-label={`Roles in ${active?.name ?? 'profile'}`} className="settings-roles" key={list.active}>
      <div role="row" className="settings-roles__row"><span role="columnheader">Role</span><span role="columnheader">Model</span><span role="columnheader">Effort</span></div>
      {children}
    </div>}
    <Text type="supporting" color="secondary">Changes save into {active?.name ?? 'the active profile'}. Provider default leaves effort to the provider.</Text>
    <HStack gap={2} wrap="wrap">
      <Button label="Refresh models" size="sm" variant="ghost" isDisabled={refreshing} isLoading={refreshing} onClick={() => void refresh()} />
      <Button label="Manage connections" size="sm" variant="ghost" onClick={connections} />
    </HStack>
    {!refreshing && models && !models.some(m => providers?.[m.provider]?.connected) && <Text type="supporting">No models available. Sign in or configure a custom endpoint under Connections, then refresh models.</Text>}
    {modelError && <Text type="supporting" role="alert">{modelError}</Text>}
  </VStack>;
}

// Global on/off, outside every profile.
export function AutomaticSuggestions({ api }: { api: (path: string, body?: unknown) => Promise<{ enabled: boolean }> }) {
  const [enabled, setEnabled] = useState<boolean>(), [pending, setPending] = useState(false), [error, setError] = useState('');
  useEffect(() => { api('/api/settings/suggestions').then(s => setEnabled(s.enabled), e => setError((e as Error).message)); }, []);
  async function save(next: boolean) {
    setPending(true); setError('');
    try { setEnabled((await api('/api/settings/suggestions', { enabled: next })).enabled); }
    catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  return <VStack gap={2}>
    <Switch label="Automatic suggestions" value={enabled ?? false} onChange={next => void save(next)} isDisabled={enabled === undefined || pending} isLoading={pending} description="Underlines terms worth a branch after each new saved reply. Applies to every profile; calls already running finish." />
    {error && <Text type="supporting" role="alert">{error}</Text>}
  </VStack>;
}
