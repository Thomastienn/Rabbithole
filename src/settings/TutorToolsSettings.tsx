import { Fragment, useEffect, useState } from 'react';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Section } from './InterfaceSettings';

type Tool = { name: string; label: string; enabled: boolean; setup?: string };

export default function TutorToolsSettings({
    api,
}: {
    api: (path: string, body?: unknown) => Promise<Tool[]>;
}) {
    const [tools, setTools] = useState<Tool[]>(),
        [pending, setPending] = useState('loading'),
        [error, setError] = useState('');
    async function load() {
        setPending('loading');
        setError('');
        try {
            setTools(await api('/api/settings/tutor-tools'));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPending('');
        }
    }
    useEffect(() => {
        void load();
    }, []);
    return (
        <Section
            title="Tutor tools"
            description="Tools available to chat models that use tutor tools. Turning a tool off hides it from every provider on the next reply. Quick thinking and smart models stay tool-free."
        >
            {tools?.map((tool) => (
                <Fragment key={tool.name}>
                    <Switch
                        label={tool.label}
                        value={tool.enabled}
                        isDisabled={!!pending}
                        isLoading={pending === tool.name}
                        onChange={async (enabled) => {
                            setPending(tool.name);
                            setError('');
                            try {
                                setTools(
                                    await api('/api/settings/tutor-tools', {
                                        name: tool.name,
                                        enabled,
                                    }),
                                );
                            } catch (e) {
                                setError((e as Error).message);
                            } finally {
                                setPending('');
                            }
                        }}
                    />
                    {tool.setup && <Text type="supporting">{tool.setup}</Text>}
                </Fragment>
            ))}
            {pending === 'loading' && (
                <Text type="supporting" role="status">
                    Loading tutor tools…
                </Text>
            )}
            {!tools && !pending && (
                <Button
                    label="Retry tutor tools"
                    size="sm"
                    variant="secondary"
                    onClick={() => void load()}
                />
            )}
            {error && (
                <Text type="supporting" role="alert">
                    {error}
                </Text>
            )}
        </Section>
    );
}
