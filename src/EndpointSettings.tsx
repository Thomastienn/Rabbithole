import { useEffect, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';

type Endpoint = { configured: boolean; baseUrl: string | null };

export default function EndpointSettings({ api, changed }: { api: (path: string, body?: unknown) => Promise<Endpoint>; changed: () => void }) {
  const [saved, setSaved] = useState<Endpoint>();
  const [baseUrl, setBaseUrl] = useState(''), [apiKey, setApiKey] = useState('');
  const [pending, setPending] = useState('loading'), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function load() {
    setPending('loading'); setError('');
    try { const status = await api('/api/settings/endpoint'); setSaved(status); setBaseUrl(status.baseUrl ?? ''); }
    catch (e) { setError((e as Error).message); }
    finally { setPending(''); }
  }
  useEffect(() => { void load(); }, []);
  async function act(action: 'save' | 'test' | 'clear') {
    if (pending) return;
    setPending(action); setError(''); setMessage('');
    try {
      const status = await api(`/api/settings/endpoint${action === 'save' ? '' : `/${action}`}`, action === 'save' ? { baseUrl, apiKey } : {});
      setSaved(status); setBaseUrl(status.baseUrl ?? '');
      setMessage(action === 'save' ? 'Endpoint saved. Choose its model in the chat menu.' : action === 'test' ? 'Connection works: model listing succeeded. Chat access can still vary by model.' : 'Endpoint removed. Saved conversations remain; choose another provider to continue.');
    } catch (e) { setError((e as Error).message); }
    finally { setApiKey(''); setPending(''); changed(); }
  }
  const dirty = baseUrl !== (saved?.baseUrl ?? '') || !!apiKey;
  return <form className="endpoint-settings" aria-label="Custom endpoint settings" onSubmit={e => { e.preventDefault(); if (saved && baseUrl.trim() && apiKey.trim()) void act('save'); }}><VStack gap={3}>
    <Heading level={4}>Custom endpoint</Heading>
    <Text type="supporting">Requests, including discussion and inherited context, go to this endpoint and are billed by its owner. It is used only when you select its model.</Text>
    <Text type="supporting" role="status">{pending === 'loading' ? 'Loading endpoint settings…' : !saved ? 'Endpoint settings unavailable. Retry below.' : saved.configured ? 'An endpoint is saved. The saved key is never shown.' : 'No endpoint configured.'}</Text>
    <TextInput label="Base URL" type="url" description="API root including its path prefix, for example http://127.0.0.1:8080/v1. Use HTTPS for remote endpoints." value={baseUrl} onChange={setBaseUrl} isReadOnly={!!pending} autoComplete="off" isRequired />
    <TextInput label="API key" type="password" description="Enter a key each time you save. It stays in a local owner-only file and is never returned to this form." value={apiKey} onChange={setApiKey} isReadOnly={!!pending} autoComplete="new-password" isRequired />
    <HStack gap={2} wrap="wrap">
      <Button label={pending === 'save' ? 'Saving…' : 'Save'} type="submit" size="sm" isDisabled={!!pending || !saved || !baseUrl.trim() || !apiKey.trim()} />
      <Button label={pending === 'test' ? 'Testing…' : 'Test connection'} variant="secondary" size="sm" isDisabled={!!pending || !saved?.configured || dirty} onClick={() => void act('test')} />
      <Button label="Remove" variant="ghost" size="sm" isDisabled={!!pending || !saved?.configured} onClick={() => void act('clear')} />
    </HStack>
    <Text type="supporting" color="secondary">Save URL/key changes before testing. Test connection checks the saved endpoint’s model listing; it sends no chat message.</Text>
    {message && <Text type="supporting" role="status">{message}</Text>}
    {error && <Text type="supporting" role="alert">{error}</Text>}
    {!saved && !pending && <Button label="Retry loading endpoint settings" variant="ghost" size="sm" onClick={() => void load()} />}
  </VStack></form>;
}
