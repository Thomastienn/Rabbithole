import { useEffect, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import { effortLabel, type Model, type ChatSelection } from './models';

const key = (selection: Pick<Model, 'provider' | 'model'>) => JSON.stringify({ provider: selection.provider, model: selection.model });
const labels: Record<string, string> = { claude: 'Claude', codex: 'Codex', openai: 'Custom endpoint' };

export default function ChatSettings({ api, models, providers, modelError, reloadModels, connections }: {
  api: (path: string, body?: unknown) => Promise<ChatSelection>;
  models?: Model[];
  providers?: Record<string, { connected: boolean }>;
  modelError: string;
  reloadModels: () => Promise<void>;
  connections: () => void;
}) {
  const [saved, setSaved] = useState<ChatSelection>();
  const [pending, setPending] = useState('loading'), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function load() {
    setPending('loading'); setError('');
    try { setSaved(await api('/api/settings/chat')); }
    catch (e) { setError((e as Error).message); }
    finally { setPending(''); }
  }
  useEffect(() => { void load(); }, []);
  const available = (models ?? []).filter(m => providers?.[m.provider]?.connected);
  const selected = saved && available.find(m => m.provider === saved.provider && (saved.model ? m.model === saved.model : m.isDefault));
  const unavailable = !!saved && !!models && !selected;
  const incompatible = !!saved?.effort && !!selected && !(selected.efforts ?? []).includes(saved.effort);
  async function save(selection: ChatSelection) {
    if (!saved || pending) return;
    setPending('saving'); setError(''); setMessage('');
    try {
      setSaved(await api('/api/settings/chat', selection));
      setMessage(`Chat defaults saved. Existing conversations keep their choices.${saved.effort && selection.effort === null && selection.model !== saved.model ? ' Effort changed to Provider default for this model.' : ''}`);
    } catch (e) { setError((e as Error).message); }
    finally { setPending(''); }
  }
  return <VStack gap={3}>
    <Heading level={3}>Chat default</Heading>
    <Text type="supporting" color="secondary">Starts new learning trees. Conversations keep their saved choices; branches inherit their parent’s current model and effort.</Text>
    <Selector label="Chat default model" value={selected ? key(selected) : 'unavailable'} size="sm" width="100%" hasSearch isDisabled={!saved || !!pending} options={[
      ...(!selected ? [{ value: 'unavailable', label: saved ? `${labels[saved.provider] ?? saved.provider} · ${saved.model ?? 'default model'}${models ? ' (unavailable)' : ''}` : 'Loading chat default…', disabled: true }] : []),
      ...Object.keys(labels).map(provider => ({ type: 'section' as const, title: labels[provider], options: available.filter(m => m.provider === provider).map(m => ({ value: key(m), label: m.label })) })).filter(section => section.options.length),
    ]} onChange={value => {
      const model = available.find(m => key(m) === value);
      if (model && saved) void save({ provider: model.provider, model: model.model, effort: saved.effort && model.efforts?.includes(saved.effort) ? saved.effort : null });
    }} />
    <Selector label="Chat default effort" value={saved?.effort ?? 'default'} size="sm" width="100%" isDisabled={!selected || !!pending} description={selected?.efforts?.length ? 'Applies to new learning trees. Provider default leaves effort to the provider.' : 'This model does not advertise effort choices. Provider default leaves effort to the provider.'} options={[
      { value: 'default', label: 'Provider default' },
      ...(incompatible ? [{ value: saved!.effort!, label: `${effortLabel(saved!.effort)} (unavailable)`, disabled: true }] : []),
      ...(selected?.efforts ?? []).map(effort => ({ value: effort, label: effortLabel(effort) })),
    ]} onChange={value => { if (selected) void save({ provider: selected.provider, model: selected.model, effort: value === 'default' ? null : value }); }} />
    {(unavailable || incompatible) && <Text type="supporting" role="alert">Saved chat default unavailable. Check Connections, refresh models, or choose an available model and effort. New learning trees will not switch providers automatically.</Text>}
    <HStack gap={2} wrap="wrap"><Button label="Refresh chat models" size="sm" variant="ghost" isDisabled={!!pending} onClick={() => void reloadModels()} /><Button label="Manage connections" size="sm" variant="ghost" onClick={connections} /></HStack>
    <Text type="supporting" role="status">{pending === 'loading' ? 'Loading chat defaults…' : pending === 'saving' ? 'Saving chat defaults…' : message}</Text>
    {(error || modelError) && <Text type="supporting" role="alert">{error || modelError}</Text>}
    {!saved && !pending && <Button label="Retry loading chat defaults" size="sm" variant="ghost" onClick={() => void load()} />}
  </VStack>;
}
