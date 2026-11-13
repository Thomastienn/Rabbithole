import { useEffect, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

type Endpoint = { id: string; name: string; baseUrl: string };

export default function EndpointSettings({ api, changed }: { api: (path: string, body?: unknown) => Promise<Endpoint[]>; changed: () => void }) {
  const [list, setList] = useState<Endpoint[]>();
  const [adding, setAdding] = useState(false), [removing, setRemoving] = useState<Endpoint>();
  const [name, setName] = useState(''), [baseUrl, setBaseUrl] = useState(''), [apiKey, setApiKey] = useState('');
  const [pending, setPending] = useState('loading'), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function load() {
    setPending('loading'); setError('');
    try { setList(await api('/api/settings/endpoints')); }
    catch (e) { setError((e as Error).message); }
    finally { setPending(''); }
  }
  useEffect(() => { void load(); }, []);
  async function act(action: 'add' | 'remove', body: unknown, done: string) {
    if (pending) return;
    setPending(action); setError(''); setMessage('');
    try {
      setList(await api(`/api/settings/endpoints${action === 'remove' ? '/remove' : ''}`, body));
      setMessage(done);
      if (action === 'add') { setAdding(false); setName(''); setBaseUrl(''); }
      setRemoving(undefined);
    } catch (e) { setError((e as Error).message); }
    finally { setApiKey(''); setPending(''); changed(); }
  }
  const openAdd = () => { setAdding(true); setError(''); setMessage(''); };
  const nameTaken = error.startsWith('Another endpoint is called');
  const form = adding && <form className="endpoint-form" aria-label="New endpoint" onSubmit={e => { e.preventDefault(); if (name.trim() && baseUrl.trim() && apiKey.trim()) void act('add', { name, baseUrl, apiKey }, `${name.trim()} added. Choose its models in any model menu.`); }}><VStack gap={3}>
    <Heading level={4}>New endpoint</Heading>
    <TextInput label="Name" description="Shown in model menus." placeholder="For example, Local llama" value={name} onChange={setName} isReadOnly={!!pending} autoComplete="off" isRequired hasAutoFocus status={nameTaken ? { type: 'error', message: error } : undefined} />
    <TextInput label="Base URL" type="url" description="API root including its path prefix. Use HTTPS for remote endpoints." placeholder="http://127.0.0.1:8080/v1" value={baseUrl} onChange={setBaseUrl} isReadOnly={!!pending} autoComplete="off" isRequired />
    <TextInput label="API key" type="password" description="Stored in an owner-only file on this computer. The saved key is never shown." value={apiKey} onChange={setApiKey} isReadOnly={!!pending} autoComplete="new-password" isRequired />
    <HStack gap={2} wrap="wrap">
      <Button label={pending === 'add' ? 'Saving…' : 'Save'} type="submit" size="sm" isDisabled={!!pending || !name.trim() || !baseUrl.trim() || !apiKey.trim()} />
      <Button label="Cancel" variant="secondary" size="sm" isDisabled={!!pending} onClick={() => { setAdding(false); setApiKey(''); setError(''); }} />
    </HStack>
  </VStack></form>;
  return <VStack gap={3} className="endpoint-settings" as="section" aria-label="Custom endpoints">
    <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
      <Heading level={3}>Custom endpoints</Heading>
      {/* Always rendered so a settings link can focus it before the list loads. */}
      <Button className="endpoint-add" label="Add endpoint" variant="secondary" size="sm" icon={<PlusIcon />} isDisabled={adding} onClick={openAdd} />
    </HStack>
    <Text type="supporting" color="secondary">OpenAI-compatible APIs. Each appears under its own name wherever you choose a model. Requests, including discussion and inherited context, go to that endpoint and are billed by its owner.</Text>
    {pending === 'loading' && <Text type="supporting" role="status">Loading endpoints…</Text>}
    {form}
    {list?.length === 0 && !adding && <EmptyState isCompact headingLevel={4} title="No custom endpoints yet" description="Add one to use a local or OpenAI-compatible model." actions={<Button label="Add endpoint" size="sm" icon={<PlusIcon />} onClick={openAdd} />} />}
    {list?.map(e => <HStack key={e.id} gap={2} vAlign="center" hAlign="between" className="endpoint-row" data-endpoint={e.id}>
      <VStack gap={0}><Text weight="bold">{e.name}</Text><Text type="supporting" color="secondary">{e.baseUrl}</Text></VStack>
      <Button label={`Remove ${e.name}`} variant="ghost" size="sm" icon={<TrashIcon />} isDisabled={!!pending} onClick={() => setRemoving(e)}>Remove</Button>
    </HStack>)}
    {message && <Text type="supporting" role="status">{message}</Text>}
    {error && !nameTaken && !removing && <Text type="supporting" role="alert">{error}</Text>}
    {!list && !pending && <HStack><Button label="Retry loading endpoints" variant="ghost" size="sm" onClick={() => void load()} /></HStack>}
    {removing && <AlertDialog className="endpoint-remove-dialog" width="min(420px, calc(100vw - 2rem))" isOpen onOpenChange={open => { if (!open && !pending) { setRemoving(undefined); setError(''); } }}
      title={`Remove ${removing.name}?`} description={`Its saved key is deleted. Conversations and profiles that use its models keep their content, but those models show as unavailable until you choose another.${error ? ` Removal failed: ${error}` : ''}`}
      actionLabel="Remove" cancelLabel="Cancel" isActionLoading={pending === 'remove'} onAction={() => void act('remove', { id: removing.id }, `${removing.name} removed. Conversations that used it keep their content.`)} />}
  </VStack>;
}
