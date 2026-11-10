import { useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Switch } from '@astryxdesign/core/Switch';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';

type Model = { provider: string; model: string; label: string };
type Settings = { enabled: boolean; model: Pick<Model, 'provider' | 'model'> | null };
const key = (model: Settings['model']) => model ? JSON.stringify({ provider: model.provider, model: model.model }) : 'default';

export default function SuggestionSettings({ api, models, providers, modelError, reloadModels }: {
  api: (path: string, body?: unknown) => Promise<Settings>;
  models?: Model[];
  providers?: Record<string, { connected: boolean }>;
  modelError: string;
  reloadModels: () => Promise<void>;
}) {
  const [saved, setSaved] = useState<Settings>();
  const [pending, setPending] = useState('loading'), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  async function load() {
    setPending('loading'); setError('');
    try { setSaved(await api('/api/settings/suggestions')); }
    catch (e) { setError((e as Error).message); }
    finally { setPending(''); }
  }
  async function refreshModels() {
    setRefreshing(true);
    try { await reloadModels(); }
    finally { setRefreshing(false); }
  }
  useEffect(() => { void load(); void refreshModels(); }, []);
  async function save(change: Partial<Settings>) {
    if (!saved || pending) return;
    setPending('saving'); setError(''); setMessage('');
    try { setSaved(await api('/api/settings/suggestions', change)); setMessage('Suggestion settings saved.'); }
    catch (e) { setError((e as Error).message); void refreshModels(); }
    finally { setPending(''); }
  }
  const available = (models ?? []).filter(m => ['claude', 'codex'].includes(m.provider) && providers?.[m.provider]?.connected);
  const unavailable = !!saved?.model && !available.some(m => key(m) === key(saved.model));
  return <VStack gap={3}>
    <Heading level={4}>Suggestions</Heading>
    <Switch label="Automatic suggestions" value={saved?.enabled ?? false} onChange={enabled => void save({ enabled })} isDisabled={!saved || !!pending} isLoading={pending === 'saving'} description="New saved replies only. Saved suggestions stay visible; calls already running finish." />
    <Selector label="Suggestion model" value={key(saved?.model ?? null)} size="sm" width="100%" hasSearch isDisabled={!saved || !!pending || refreshing} isLoading={refreshing} description="Default follows each conversation: Haiku for Claude, Luna for Codex. A pinned model applies across conversations." options={[
      { value: 'default', label: 'Default for each provider' },
      ...(unavailable ? [{ value: key(saved!.model), label: `${saved!.model!.provider === 'claude' ? 'Claude' : 'Codex'} · ${saved!.model!.model} (unavailable)`, disabled: true }] : []),
      ...(['claude', 'codex'] as const).map(provider => ({ type: 'section' as const, title: provider === 'claude' ? 'Claude' : 'Codex', options: available.filter(m => m.provider === provider).map(m => ({ value: key(m), label: m.label })) })).filter(section => section.options.length),
    ]} onChange={value => void save({ model: value === 'default' ? null : JSON.parse(value) })} />
    <Text type="supporting" color="secondary">Uses signed-in Claude or Codex subscriptions. For custom endpoint conversations, pin a subscription model.</Text>
    {unavailable && <Text type="supporting">Pinned model unavailable. Sign in under Connections, refresh models, or choose the default. Suggestions will not switch providers automatically.</Text>}
    {!refreshing && !available.length && <Text type="supporting">No subscription models available. Sign in under Connections, then refresh models.</Text>}
    <Button label="Refresh suggestion models" size="sm" variant="ghost" isDisabled={!!pending || refreshing} isLoading={refreshing} onClick={() => void refreshModels()} />
    <Text type="supporting" role="status">{pending === 'loading' ? 'Loading suggestion settings…' : pending === 'saving' ? 'Saving suggestion settings…' : message}</Text>
    {(error || modelError) && <Text type="supporting" role="alert">{error || modelError}</Text>}
    {!saved && !pending && <Button label="Retry loading suggestion settings" size="sm" variant="ghost" onClick={() => void load()} />}
  </VStack>;
}
