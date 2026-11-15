import { useEffect, useState } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Section } from './InterfaceSettings';

type SearchStatus = {
  url: string | null;
  managedUrl: string | null;
  customUrl: string | null;
  ready: boolean;
  error: string | null;
};

export default function SearchSettings({
  api,
}: {
  api: (path: string, body?: unknown) => Promise<SearchStatus>;
}) {
  const [saved, setSaved] = useState<SearchStatus>(),
    [url, setUrl] = useState(''),
    [pending, setPending] = useState(true),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  function show(state: SearchStatus) {
    setSaved(state);
    setUrl(state.url ?? '');
    setError(state.error ?? '');
  }
  async function load() {
    setPending(true);
    setError('');
    try {
      show(await api('/api/settings/searxng'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function act(action: 'save' | 'test' | 'managed') {
    setPending(true);
    setMessage('');
    setError('');
    try {
      const state = await api(`/api/settings/searxng${action === 'test' ? '/test' : ''}`, {
        url: action === 'managed' ? null : url.trim(),
      });
      if (action !== 'test') show(state);
      if (state.ready)
        setMessage(
          action === 'test'
            ? 'JSON search succeeded.'
            : 'Search settings saved. JSON search succeeded.',
        );
      else
        setError(state.error ?? 'SearXNG is unavailable. Check the instance and try Test again.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Section
      title="Search"
      description="Web search and image finding use SearXNG. Starts with the instance TreeTutor runs on this computer; you can use your own instead. Search tools are hidden while it is unavailable."
    >
      <TextInput
        label="SearXNG URL"
        value={url}
        onChange={(value) => {
          setUrl(value);
          setMessage('');
          setError('');
        }}
        isDisabled={pending || !saved}
        autoComplete="off"
      />
      <HStack gap={2} wrap="wrap">
        <Button
          label="Save search URL"
          size="sm"
          isDisabled={pending || !saved}
          onClick={() => void act('save')}
        />
        <Button
          label="Test search"
          variant="secondary"
          size="sm"
          isDisabled={pending || !saved}
          onClick={() => void act('test')}
        />
        <Button
          label="Use app-managed instance"
          variant="secondary"
          size="sm"
          isDisabled={pending || !saved}
          onClick={() => void act('managed')}
        />
      </HStack>
      {!saved && !pending && (
        <Button
          label="Retry search settings"
          variant="secondary"
          size="sm"
          onClick={() => void load()}
        />
      )}
      {pending && (
        <Text type="supporting" role="status">
          Checking SearXNG…
        </Text>
      )}
      {message && (
        <Text type="supporting" role="status">
          {message}
        </Text>
      )}
      {error && (
        <Text type="supporting" role="alert" style={{ color: 'var(--color-text-error)' }}>
          {error}
        </Text>
      )}
    </Section>
  );
}
