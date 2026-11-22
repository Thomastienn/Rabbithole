import { useEffect, useState } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { Done, Section } from './InterfaceSettings';
import { request as api } from '../serverAccess';

type Sandbox = { windows: boolean; ready: boolean };

// The code sandbox's status (bwrap, or the Windows sandbox) and the Windows one-time setup behind one UAC prompt.
export function useSandbox() {
    const [sandbox, setSandbox] = useState<Sandbox>(),
        [pending, setPending] = useState(false),
        [declined, setDeclined] = useState(false),
        [error, setError] = useState('');
    const check = () =>
        void api('/api/setup/sandbox')
            .then((s) => setSandbox(s as Sandbox))
            .catch(() => {});
    useEffect(check, []);
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
    return { sandbox, pending, declined, error, check, enable };
}

// Windows only: the sandbox's one-time setup in first-run setup.
export default function SandboxSettings() {
    const { sandbox, pending, declined, error, enable } = useSandbox();
    if (!sandbox?.windows) return null;
    return (
        <>
            <Section
                title="Video sandbox"
                description="Videos and Python run model-written code in a Windows sandbox. Turning it on asks once for administrator rights."
            >
                {sandbox.ready ? (
                    <Done>The sandbox is on.</Done>
                ) : (
                    <Text type="supporting" role="status">
                        {declined
                            ? 'The sandbox was not enabled. Video making stays off until it is enabled; you can try again from Settings.'
                            : pending
                              ? 'Waiting for the administrator prompt…'
                              : 'The sandbox is off, so video making is unavailable.'}
                    </Text>
                )}
                {!sandbox.ready && !declined && (
                    <HStack>
                        <Button
                            label="Enable sandbox"
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
            <Divider />
        </>
    );
}
