import { useEffect, useState } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Section } from './InterfaceSettings';

type MemoryNote = { note: string };

export default function MemoryNoteSettings({
  api,
}: {
  api: (path: string, body?: unknown) => Promise<MemoryNote>;
}) {
  const [loaded, setLoaded] = useState(false),
    [text, setText] = useState(''),
    [pending, setPending] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const show = (saved: MemoryNote) => {
    setText(saved.note);
    setLoaded(true);
  };
  useEffect(() => {
    api('/api/settings/memory-note').then(show, (e) => setError((e as Error).message));
  }, []);
  async function save() {
    setPending(true);
    setStatus('');
    setError('');
    try {
      show(await api('/api/settings/memory-note', { note: text }));
      setStatus('Memory note saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const disabled = !loaded || pending;
  return (
    <Section
      title="Memory note"
      description="What the tutor remembers about you across all learning trees, in markdown. Every chat model receives the whole note as data, not instructions. Fix or delete anything wrong; empty text clears it."
    >
      <TextArea
        label="Memory note"
        isLabelHidden
        value={text}
        onChange={setText}
        rows={8}
        isDisabled={disabled}
      />
      <HStack gap={2}>
        <Button label="Save" size="sm" isDisabled={disabled} onClick={() => void save()} />
      </HStack>
      {status && (
        <Text type="supporting" role="status">
          {status}
        </Text>
      )}
      {error && (
        <Text type="supporting" role="alert">
          {error}
        </Text>
      )}
    </Section>
  );
}
