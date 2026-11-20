import { useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { searchModels, type Model } from './models';
import { ModelSearch } from './ModelPicker';
import type { Endpoint } from './EndpointSettings';

// Each model's image and tool overrides save independently.
export default function EndpointModels({
    endpoint,
    models,
    save,
    retest,
}: {
    endpoint: Endpoint;
    models: Model[];
    save: (model: string, field: 'readsImages' | 'usesTutorTools', on: boolean) => Promise<void>;
    retest: (model: string) => Promise<void>;
}) {
    const [query, setQuery] = useState(''),
        [saving, setSaving] = useState(''),
        [error, setError] = useState('');
    const { shown, found } = searchModels(
        models.map((m) => ({ ...m, value: m.model })),
        query,
    );
    return (
        <VStack
            gap={2}
            className="endpoint-models"
            as="section"
            aria-label={`${endpoint.name} models`}
        >
            <Text type="supporting" color="secondary">
                Reads images: on sends images to the model; off sends their OCR text. Starts from
                what the endpoint reports. Uses tutor tools allows the tools enabled in Settings;
                unless the endpoint reports it, a tiny tool call on first use sets it. Retest runs
                that check again.
            </Text>
            <ModelSearch query={query} setQuery={setQuery} />
            {shown.map((m) => (
                <VStack key={m.model} gap={1} role="group" aria-label={m.label}>
                    {(['readsImages', 'usesTutorTools'] as const).map((field) => (
                        <Switch
                            key={field}
                            label={`${m.label} · ${field === 'readsImages' ? 'Reads images' : 'Uses tutor tools'}`}
                            value={!!m[field]}
                            isLoading={saving === `${m.model}:${field}`}
                            isDisabled={!!saving}
                            onChange={async (on) => {
                                setSaving(`${m.model}:${field}`);
                                setError('');
                                try {
                                    await save(m.model, field, on);
                                } catch (e) {
                                    setError((e as Error).message);
                                } finally {
                                    setSaving('');
                                }
                            }}
                        />
                    ))}
                    <Button
                        label={`Retest ${m.label} tool support`}
                        variant="ghost"
                        size="sm"
                        isLoading={saving === `${m.model}:retest`}
                        isDisabled={!!saving}
                        onClick={async () => {
                            setSaving(`${m.model}:retest`);
                            setError('');
                            try {
                                await retest(m.model);
                            } catch (e) {
                                setError((e as Error).message);
                            } finally {
                                setSaving('');
                            }
                        }}
                    >
                        Retest
                    </Button>
                </VStack>
            ))}
            <Text type="supporting" color="secondary" role="status">
                {!models.length
                    ? 'No models listed. Test the endpoint, then try again.'
                    : !found
                      ? 'No models match.'
                      : found > shown.length
                        ? `Showing ${shown.length} of ${found} models. Search to narrow.`
                        : `${found} ${found === 1 ? 'model' : 'models'}`}
            </Text>
            {error && (
                <Text type="supporting" role="alert">
                    {error}
                </Text>
            )}
        </VStack>
    );
}
