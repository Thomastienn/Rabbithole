import { useEffect, useState } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Section } from './InterfaceSettings';

type TutorStyle = { style: string | null; default: string };

export default function TutorStyleSettings({
  api,
}: {
  api: (path: string, body?: unknown) => Promise<TutorStyle>;
}) {
  const [loaded, setLoaded] = useState(false),
    [text, setText] = useState(''),
    [pending, setPending] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const show = (saved: TutorStyle) => {
    setText(saved.style ?? saved.default);
    setLoaded(true);
  };
  useEffect(() => {
    api('/api/settings/tutor-style').then(show, (e) => setError((e as Error).message));
  }, []);
  async function save(style: string | null) {
    setPending(true);
    setStatus('');
    setError('');
    try {
      const saved = await api('/api/settings/tutor-style', { style });
      show(saved);
      setStatus(saved.style === null ? 'Using the default tutor style.' : 'Tutor style saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const disabled = !loaded || pending;
  return (
    <Section
      title="Tutor style"
      description="How the tutor teaches. Every chat model receives it first, then TreeTutor's fixed safety, visual and video rules, which it cannot change. Applies to your next message in every learning tree; empty text uses the default."
    >
      <TextArea
        label="Tutor style"
        isLabelHidden
        value={text}
        onChange={setText}
        rows={8}
        isDisabled={disabled}
      />
      <HStack gap={2}>
        <Button label="Save" size="sm" isDisabled={disabled} onClick={() => void save(text)} />
        <Button
          label="Restore default"
          variant="secondary"
          size="sm"
          isDisabled={disabled}
          onClick={() => void save(null)}
        />
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
