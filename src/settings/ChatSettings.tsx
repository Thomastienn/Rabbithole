import { useEffect, useState } from 'react';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import {
  CUSTOM_EFFORT,
  effortOptions,
  effortSupported,
  effortWasReset,
  keptEffort,
  type Model,
  type ChatSelection,
} from './models';
import CustomEffort from './CustomEffort';

const key = (selection: Pick<Model, 'provider' | 'model'>) =>
  JSON.stringify({ provider: selection.provider, model: selection.model });

export default function ChatSettings({
  api,
  models,
  providers,
  onSaved,
}: {
  api: (path: string, body?: unknown) => Promise<ChatSelection>;
  models?: Model[];
  providers?: Record<string, { label: string; connected: boolean }>;
  onSaved?: () => void;
}) {
  const [saved, setSaved] = useState<ChatSelection>();
  const [pending, setPending] = useState('loading'),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [typing, setTyping] = useState(false);
  async function load() {
    setPending('loading');
    setError('');
    try {
      setSaved(await api('/api/settings/chat'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending('');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const available = (models ?? []).filter((m) => providers?.[m.provider]?.connected);
  const selected =
    saved &&
    available.find(
      (m) => m.provider === saved.provider && (saved.model ? m.model === saved.model : m.isDefault),
    );
  const unavailable = !!saved?.provider && !!models && !selected;
  const incompatible = !!saved?.effort && !!selected && !effortSupported(saved.effort, selected);
  async function save(selection: ChatSelection) {
    if (!saved || pending) return;
    setPending('saving');
    setError('');
    setMessage('');
    try {
      setSaved(await api('/api/settings/chat', selection));
      onSaved?.();
      setMessage(
        `Chat defaults saved. Existing conversations keep their choices.${effortWasReset(saved, selection) ? ' Effort changed to Provider default for this model.' : ''}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending('');
    }
  }
  return (
    <>
      <div role="row" className="settings-roles__row">
        <div role="rowheader" className="settings-roles__role">
          <b>Chat</b>
          <small>Answers your questions in new learning trees</small>
        </div>
        <div role="cell">
          <Selector
            label="Chat default model"
            isLabelHidden
            value={selected ? key(selected) : 'unavailable'}
            size="sm"
            width="100%"
            hasSearch
            isDisabled={!saved || !!pending}
            status={unavailable ? { type: 'error' } : undefined}
            options={[
              ...(!selected
                ? [
                    {
                      value: 'unavailable',
                      label: !saved
                        ? 'Loading chat default…'
                        : !saved.provider
                          ? 'Not set'
                          : `${providers?.[saved.provider]?.label ?? saved.provider} · ${saved.model ?? 'default model'}${models ? ' (unavailable)' : ''}`,
                      disabled: true,
                    },
                  ]
                : []),
              ...Object.entries(providers ?? {})
                .map(([provider, { label }]) => ({
                  type: 'section' as const,
                  title: label,
                  options: available
                    .filter((m) => m.provider === provider)
                    .map((m) => ({ value: key(m), label: m.label })),
                }))
                .filter((section) => section.options.length),
            ]}
            onChange={(value) => {
              const model = available.find((m) => key(m) === value);
              if (model && saved)
                void save({
                  provider: model.provider,
                  model: model.model,
                  effort: keptEffort(saved.effort, model),
                });
            }}
          />
        </div>
        <div role="cell">
          <Selector
            label="Chat default effort"
            isLabelHidden
            value={saved?.effort ?? 'default'}
            size="sm"
            width="100%"
            isDisabled={!selected || !!pending}
            status={incompatible ? { type: 'error' } : undefined}
            options={effortOptions(selected ? saved?.effort : null, selected)}
            onChange={(value) => {
              if (value === CUSTOM_EFFORT) setTyping(true);
              else if (selected)
                void save({
                  provider: selected.provider,
                  model: selected.model,
                  effort: value === 'default' ? null : value,
                });
            }}
          />
          {typing && selected && (
            <CustomEffort
              label="Custom chat default effort"
              onCancel={() => setTyping(false)}
              onSave={(effort) => {
                setTyping(false);
                void save({ provider: selected.provider, model: selected.model, effort });
              }}
            />
          )}
        </div>
      </div>
      <div role="row" className="settings-roles__row">
        <div role="cell" className="settings-roles__note">
          {(unavailable || incompatible) && (
            <Text type="supporting" role="alert">
              Saved chat default unavailable. Check Connections, refresh models, or choose an
              available model and effort. New learning trees will not switch providers
              automatically.
            </Text>
          )}
          <Text type="supporting" role="status">
            {pending === 'loading'
              ? 'Loading chat defaults…'
              : pending === 'saving'
                ? 'Saving chat defaults…'
                : message}
          </Text>
          {error && (
            <Text type="supporting" role="alert">
              {error}
            </Text>
          )}
          {!saved && !pending && (
            <Button
              label="Retry loading chat defaults"
              size="sm"
              variant="ghost"
              onClick={() => void load()}
            />
          )}
        </div>
      </div>
    </>
  );
}
