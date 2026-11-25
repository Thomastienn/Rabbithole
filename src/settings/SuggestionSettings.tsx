import { useEffect, useState } from 'react';
import { Switch } from '@astryxdesign/core/Switch';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import ModelPicker from './ModelPicker';
import { Button } from '@astryxdesign/core/Button';
import { CUSTOM_EFFORT, effortOptions, effortSupported, type Model } from './models';
import CustomEffort from './CustomEffort';
import { request as api } from '../serverAccess';

type Settings = {
    enabled: boolean;
    model: Pick<Model, 'provider' | 'model'> | null;
    effort: string | null;
};
const key = (model: Settings['model']) =>
    model ? JSON.stringify({ provider: model.provider, model: model.model }) : 'default';

// Quick thinking role only; the automatic suggestions switch is global and lives beside the role table.
export default function SuggestionSettings({
    models,
    providers,
    onSaved,
}: {
    models?: Model[];
    providers?: Record<string, { label: string; connected: boolean }>;
    onSaved?: () => void;
}) {
    const [saved, setSaved] = useState<Settings>();
    const [pending, setPending] = useState('loading'),
        [error, setError] = useState(''),
        [message, setMessage] = useState(''),
        [typing, setTyping] = useState(false);
    async function load() {
        setPending('loading');
        setError('');
        try {
            setSaved(await api('/api/settings/suggestions'));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPending('');
        }
    }
    useEffect(() => {
        void load();
    }, []);
    async function save(change: Partial<Settings>) {
        if (!saved || pending) return;
        setPending('saving');
        setError('');
        setMessage('');
        try {
            setSaved(await api('/api/settings/suggestions', change));
            onSaved?.();
            setMessage(
                `Quick thinking settings saved.${saved.effort && change.model && change.effort === null ? ' Effort changed to Provider default for this model.' : ''}`,
            );
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPending('');
        }
    }
    const available = (models ?? []).filter((m) => providers?.[m.provider]?.connected);
    const selected = saved?.model ? available.find((m) => key(m) === key(saved.model)) : undefined;
    const unavailable = !!saved?.model && !!models && !selected;
    const incompatible = !!saved?.effort && !!selected && !effortSupported(saved.effort, selected);
    return (
        <>
            <div role="row" className="settings-roles__row">
                <div role="rowheader" className="settings-roles__role">
                    <b>Quick thinking</b>
                    <small>
                        Picks suggestions and prepares branch context. The default needs a Claude or
                        Codex conversation.
                    </small>
                </div>
                <div role="cell">
                    <ModelPicker
                        label="Quick thinking model"
                        value={key(saved?.model ?? null)}
                        isDisabled={!saved || !!pending}
                        isUnavailable={unavailable}
                        options={[
                            {
                                value: 'default',
                                label: 'Default for each provider',
                                description: 'Haiku for Claude, Luna for Codex',
                            },
                            ...(saved?.model && !selected
                                ? [
                                      {
                                          value: key(saved.model),
                                          label: `${providers?.[saved.model.provider]?.label ?? saved.model.provider} · ${saved.model.model}${models ? ' (unavailable)' : ''}`,
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
                            if (value === 'default') return void save({ model: null });
                            const model = available.find((m) => key(m) === value);
                            if (model)
                                void save({
                                    model: { provider: model.provider, model: model.model },
                                    effort:
                                        saved?.effort && model.efforts?.includes(saved.effort)
                                            ? saved.effort
                                            : null,
                                });
                        }}
                    />
                </div>
                <div role="cell">
                    <Selector
                        label="Quick thinking effort"
                        isLabelHidden
                        value={saved?.effort ?? 'default'}
                        isDisabled={!selected || !!pending}
                        status={incompatible ? { type: 'error' } : undefined}
                        options={effortOptions(selected ? saved?.effort : null, selected)}
                        onChange={(value) =>
                            value === CUSTOM_EFFORT
                                ? setTyping(true)
                                : void save({ effort: value === 'default' ? null : value })
                        }
                    />
                    {typing && selected && (
                        <CustomEffort
                            label="Custom quick thinking effort"
                            onCancel={() => setTyping(false)}
                            onSave={(effort) => {
                                setTyping(false);
                                void save({ effort });
                            }}
                        />
                    )}
                </div>
            </div>
            <div role="row" className="settings-roles__row">
                <div role="cell" className="settings-roles__note">
                    {(unavailable || incompatible) && (
                        <Text type="supporting" role="alert">
                            {unavailable
                                ? 'Quick thinking model unavailable. Check Connections, refresh models, or choose the default.'
                                : 'Quick thinking effort unsupported by this model. Choose a listed effort or Provider default.'}{' '}
                            Suggestions will not switch providers automatically.
                        </Text>
                    )}
                    <Text type="supporting" role="status">
                        {pending === 'loading'
                            ? 'Loading quick thinking settings…'
                            : pending === 'saving'
                              ? 'Saving quick thinking settings…'
                              : message}
                    </Text>
                    {error && (
                        <Text type="supporting" role="alert">
                            {error}
                        </Text>
                    )}
                    {!saved && !pending && (
                        <Button
                            label="Retry loading quick thinking settings"
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

// Global on/off, outside every profile.
export function AutomaticSuggestions() {
    const [enabled, setEnabled] = useState<boolean>(),
        [pending, setPending] = useState(false),
        [error, setError] = useState('');
    useEffect(() => {
        api('/api/settings/suggestions').then(
            (s) => setEnabled(s.enabled),
            (e) => setError((e as Error).message),
        );
    }, []);
    async function save(next: boolean) {
        setPending(true);
        setError('');
        try {
            setEnabled((await api('/api/settings/suggestions', { enabled: next })).enabled);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPending(false);
        }
    }
    return (
        <VStack gap={2}>
            <Switch
                label="Automatic suggestions"
                value={enabled ?? false}
                onChange={(next) => void save(next)}
                isDisabled={enabled === undefined || pending}
                isLoading={pending}
                description="Underlines terms worth a branch after each new saved reply. Applies to every profile; calls already running finish."
            />
            {error && (
                <Text type="supporting" role="alert">
                    {error}
                </Text>
            )}
        </VStack>
    );
}
