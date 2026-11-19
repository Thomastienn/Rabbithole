import { useEffect, useState } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { Section } from './InterfaceSettings';

type Sandbox = { windows: boolean; ready: boolean };

// Windows only: the sandbox's one-time setup, behind one UAC prompt, from first-run setup or Settings.
export default function SandboxSettings({
  api,
  firstRun = false,
}: {
  api: (path: string, body?: unknown) => Promise<unknown>;
  firstRun?: boolean;
}) {
  const [sandbox, setSandbox] = useState<Sandbox>(),
    [pending, setPending] = useState(false),
    [declined, setDeclined] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    void api('/api/setup/sandbox')
      .then((s) => setSandbox(s as Sandbox))
      .catch(() => {});
  }, []);
  if (!sandbox?.windows) return null;
  async function enable() {
    setPending(true);
    setError('');
    try {
      const next = (await api('/api/setup/sandbox', {})) as Sandbox;
      setSandbox(next);
      setDeclined(!next.ready);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      {!firstRun && <Divider />}
      <Section
        title="Video sandbox"
        description="Videos and Python run model-written code in a Windows sandbox. Turning it on asks once for administrator rights."
      >
        <Text type="supporting" role="status">
          {sandbox.ready
            ? 'The sandbox is on.'
            : declined
              ? `The sandbox was not enabled. Video making stays off until it is enabled${firstRun ? '; you can try again from Settings' : ''}.`
              : pending
                ? 'Waiting for the administrator prompt…'
                : 'The sandbox is off, so video making is unavailable.'}
        </Text>
        {!sandbox.ready && !(firstRun && declined) && (
          <HStack>
            <Button
              label={declined ? 'Try again' : 'Enable sandbox'}
              variant="secondary"
              size="sm"
              isLoading={pending}
              isDisabled={pending}
              onClick={() => void enable()}
            />
          </HStack>
        )}
        {error && (
          <Text type="supporting" role="alert">
            {error}
          </Text>
        )}
      </Section>
      {firstRun && <Divider />}
    </>
  );
}
