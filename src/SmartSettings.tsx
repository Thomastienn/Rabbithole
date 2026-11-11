import { useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import { effortLabel, type Model, type ChatSelection } from './models';

type Smart = { model: Pick<Model, 'provider' | 'model'> | null; followEffort: boolean; effort: string | null; resolved: ChatSelection };
type Change = { model?: Smart['model'] } | { followEffort: boolean; effort?: string | null; model?: Smart['model'] };
const key = (m: Pick<Model, 'provider' | 'model'>) => JSON.stringify({ provider: m.provider, model: m.model });
const labels: Record<string, string> = { claude: 'Claude', codex: 'Codex', openai: 'Custom endpoint' };

// Smart follows the global chat default per field until that field is pinned here.
export default function SmartSettings({ api, models, providers, chatVersion }: {
  api: (path: string, body?: unknown) => Promise<Smart>;
  models?: Model[];
  providers?: Record<string, { connected: boolean }>;
  chatVersion: number;
}) {
  const [saved, setSaved] = useState<Smart>();
  const [pending, setPending] = useState('loading'), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function load() {
    setPending('loading'); setError('');
    try { setSaved(await api('/api/settings/smart')); }
    catch (e) { setError((e as Error).message); }
    finally { setPending(''); }
  }
  useEffect(() => { void load(); }, [chatVersion]);
  async function save(change: Change, note = '') {
    if (!saved || pending) return;
    setPending('saving'); setError(''); setMessage('');
    try { setSaved(await api('/api/settings/smart', change)); setMessage(`Smart settings saved.${note}`); }
    catch (e) { setError((e as Error).message); }
    finally { setPending(''); }
  }
  const available = (models ?? []).filter(m => providers?.[m.provider]?.connected);
  const r = saved?.resolved;
  const selected = r && available.find(m => m.provider === r.provider && (r.model ? m.model === r.model : m.isDefault));
  const unavailable = !!saved && !!models && !selected;
  const incompatible = !!r?.effort && !!selected && !(selected.efforts ?? []).includes(r.effort);
  const followLabel = selected ? selected.label : r ? `${labels[r.provider] ?? r.provider} · ${r.model ?? 'default model'}` : '';
  return <VStack gap={3}>
    <Heading level={3}>Smart</Heading>
    <Text type="supporting" color="secondary">Creates visuals and video scripts. Model and effort each follow the chat default until you choose them here.</Text>
    <Selector label="Smart model" value={saved?.model ? key(saved.model) : 'follow'} size="sm" width="100%" hasSearch isDisabled={!saved || !!pending} options={[
      { value: 'follow', label: saved && !saved.model ? `Follow chat default (${followLabel})` : 'Follow chat default' },
      ...(saved?.model && unavailable ? [{ value: key(saved.model), label: `${labels[saved.model.provider] ?? saved.model.provider} · ${saved.model.model} (unavailable)`, disabled: true }] : []),
      ...Object.keys(labels).map(provider => ({ type: 'section' as const, title: labels[provider], options: available.filter(m => m.provider === provider).map(m => ({ value: key(m), label: m.label })) })).filter(section => section.options.length),
    ]} onChange={value => {
      if (!saved) return;
      const model = value === 'follow' ? null : available.find(m => key(m) === value);
      if (model === undefined) return;
      // A pinned effort the new model lacks resets to Provider default rather than being sent unsupported.
      const reset = !saved.followEffort && !!saved.effort && !!model && !(model.efforts ?? []).includes(saved.effort);
      void save(reset ? { model: model && { provider: model.provider, model: model.model }, followEffort: false, effort: null } : { model: model && { provider: model.provider, model: model.model } }, reset ? ' Smart effort changed to Provider default for this model.' : '');
    }} />
    <Selector label="Smart effort" value={!saved || saved.followEffort ? 'follow' : saved.effort ?? 'default'} size="sm" width="100%" isDisabled={!saved || !!pending || !selected} description={selected?.efforts?.length ? 'Provider default leaves effort to the provider.' : 'This model does not advertise effort choices. Provider default leaves effort to the provider.'} options={[
      { value: 'follow', label: saved?.followEffort ? `Follow chat default (${effortLabel(r?.effort ?? null)})` : 'Follow chat default' },
      { value: 'default', label: 'Provider default' },
      ...(saved && !saved.followEffort && saved.effort && incompatible ? [{ value: saved.effort, label: `${effortLabel(saved.effort)} (unavailable)`, disabled: true }] : []),
      ...(selected?.efforts ?? []).map(effort => ({ value: effort, label: effortLabel(effort) })),
    ]} onChange={value => void save(value === 'follow' ? { followEffort: true } : { followEffort: false, effort: value === 'default' ? null : value })} />
    {(unavailable || incompatible) && <Text type="supporting" role="alert">{unavailable ? 'Smart model unavailable. Check Connections, refresh models, or choose another model.' : `${followLabel} does not support ${effortLabel(r!.effort)} effort. Choose a listed smart effort or Provider default.`} Smart work will not switch providers or invent an effort.</Text>}
    <Text type="supporting" role="status">{pending === 'loading' ? 'Loading smart settings…' : pending === 'saving' ? 'Saving smart settings…' : message}</Text>
    {error && <Text type="supporting" role="alert">{error}</Text>}
    {!saved && !pending && <Button label="Retry loading smart settings" size="sm" variant="ghost" onClick={() => void load()} />}
  </VStack>;
}
