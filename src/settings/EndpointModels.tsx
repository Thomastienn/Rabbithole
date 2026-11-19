import { useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import type { Model } from './models';
import type { Endpoint } from './EndpointSettings';

// Rows rendered at once; search narrows a catalogue of hundreds.
const SHOWN = 50;

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
  const q = query.trim().toLowerCase(),
    found = models.filter((m) => m.model.toLowerCase().includes(q)),
    shown = found.slice(0, SHOWN);
  return (
    <VStack gap={2} className="endpoint-models" as="section" aria-label={`${endpoint.name} models`}>
      <Text type="supporting" color="secondary">
        Reads images: on sends images to the model; off sends their OCR text. Starts from what the
        endpoint reports. Uses tutor tools allows the tools enabled in Settings; unless the endpoint
        reports it, a tiny tool call on first use sets it. Retest runs that check again.
      </Text>
      <TextInput
        label="Search models"
        isLabelHidden
        placeholder="Search models"
        value={query}
        onChange={setQuery}
        autoComplete="off"
        hasClear
      />
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
          : !found.length
            ? 'No models match.'
            : found.length > shown.length
              ? `Showing ${shown.length} of ${found.length} models. Search to narrow.`
              : `${found.length} ${found.length === 1 ? 'model' : 'models'}`}
      </Text>
      {error && (
        <Text type="supporting" role="alert">
          {error}
        </Text>
      )}
    </VStack>
  );
}
