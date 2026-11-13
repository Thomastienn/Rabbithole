import { useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Switch } from '@astryxdesign/core/Switch';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import { effortLabel, type Model } from './models';

type Settings = { enabled: boolean; model: Pick<Model, 'provider' | 'model'> | null; effort: string | null };
const key = (model: Settings['model']) => model ? JSON.stringify({ provider: model.provider, model: model.model }) : 'default';

export default function SuggestionSettings({ api, models, providers, modelError, reloadModels }: {
  api: (path: string, body?: unknown) => Promise<Settings>;
  models?: Model[];
  providers?: Record<string, { label: string; connected: boolean }>;
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
    try { setSaved(await api('/api/settings/suggestions', change)); setMessage(`Quick thinking settings saved.${saved.effort && change.model && change.effort === null ? ' Effort changed to Provider default for this model.' : ''}`); }
    catch (e) { setError((e as Error).message); void refreshModels(); }
    finally { setPending(''); }
  }
  const available = (models ?? []).filter(m => providers?.[m.provider]?.connected);
  const selected = saved?.model ? available.find(m => key(m) === key(saved.model)) : undefined;
  const unavailable = !!saved?.model && !selected;
  const incompatible = !!saved?.effort && !!selected && !(selected.efforts ?? []).includes(saved.effort);
  return <VStack gap={3}>
    <Heading level={3}>Quick thinking</Heading>
    <Text type="supporting" color="secondary">Runs saved-reply suggestions in the background.</Text>
    <Switch label="Automatic suggestions" value={saved?.enabled ?? false} onChange={enabled => void save({ enabled })} isDisabled={!saved || !!pending} isLoading={pending === 'saving'} description="New saved replies only. Saved suggestions stay visible; calls already running finish." />
    <Selector label="Quick thinking model" value={key(saved?.model ?? null)} size="sm" width="100%" hasSearch isDisabled={!saved || !!pending || refreshing} isLoading={refreshing} description="Default follows each conversation: Haiku for Claude, Luna for Codex. A chosen model applies across conversations." options={[
      { value: 'default', label: 'Default for each provider' },
      ...(unavailable ? [{ value: key(saved!.model), label: `${providers?.[saved!.model!.provider]?.label ?? saved!.model!.provider} · ${saved!.model!.model} (unavailable)`, disabled: true }] : []),
      ...Object.entries(providers ?? {}).map(([provider, { label }]) => ({ type: 'section' as const, title: label, options: available.filter(m => m.provider === provider).map(m => ({ value: key(m), label: m.label })) })).filter(section => section.options.length),
    ]} onChange={value => {
      if (value === 'default') return void save({ model: null });
      const model = available.find(m => key(m) === value);
      if (model) void save({ model: { provider: model.provider, model: model.model }, effort: saved?.effort && model.efforts?.includes(saved.effort) ? saved.effort : null });
    }} />
    <Selector label="Quick thinking effort" value={saved?.effort ?? 'default'} size="sm" width="100%" isDisabled={!selected || !!pending} description={!saved?.model ? 'Choose a quick thinking model to set its effort. The default model leaves effort to the provider.' : selected?.efforts?.length ? 'Provider default leaves effort to the provider.' : 'This model does not advertise effort choices. Provider default leaves effort to the provider.'} options={[
      { value: 'default', label: 'Provider default' },
      ...(incompatible ? [{ value: saved!.effort!, label: `${effortLabel(saved!.effort)} (unavailable)`, disabled: true }] : []),
      ...(selected?.efforts ?? []).map(effort => ({ value: effort, label: effortLabel(effort) })),
    ]} onChange={value => void save({ effort: value === 'default' ? null : value })} />
    <Text type="supporting" color="secondary">The default needs a Claude or Codex conversation. For custom endpoint conversations, choose a model here.</Text>
    {(unavailable || incompatible) && <Text type="supporting" role="alert">{unavailable ? 'Quick thinking model unavailable. Check Connections, refresh models, or choose the default.' : 'Quick thinking effort unsupported by this model. Choose a listed effort or Provider default.'} Suggestions will not switch providers automatically.</Text>}
    {!refreshing && !available.length && <Text type="supporting">No models available. Sign in or configure a custom endpoint under Connections, then refresh models.</Text>}
    <Button label="Refresh quick thinking models" size="sm" variant="ghost" isDisabled={!!pending || refreshing} isLoading={refreshing} onClick={() => void refreshModels()} />
    <Text type="supporting" role="status">{pending === 'loading' ? 'Loading quick thinking settings…' : pending === 'saving' ? 'Saving quick thinking settings…' : message}</Text>
    {(error || modelError) && <Text type="supporting" role="alert">{error || modelError}</Text>}
    {!saved && !pending && <Button label="Retry loading quick thinking settings" size="sm" variant="ghost" onClick={() => void load()} />}
  </VStack>;
}
