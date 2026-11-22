import { useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import ModelPicker from './ModelPicker';
import { Button } from '@astryxdesign/core/Button';
import {
    CUSTOM_EFFORT,
    effortLabel,
    effortOptions,
    effortSupported,
    type Model,
    type ChatSelection,
} from './models';
import CustomEffort from './CustomEffort';
import { request as api } from '../serverAccess';

type Smart = {
    model: Pick<Model, 'provider' | 'model'> | null;
    followEffort: boolean;
    effort: string | null;
    resolved: ChatSelection;
};
type Change =
    | { model?: Smart['model'] }
    | { followEffort: boolean; effort?: string | null; model?: Smart['model'] };
const key = (m: Pick<Model, 'provider' | 'model'>) =>
    JSON.stringify({ provider: m.provider, model: m.model });

// Smart follows the global chat default per field until that field is pinned here.
export default function SmartSettings({
    models,
    providers,
    chatVersion,
    onSaved,
}: {
    models?: Model[];
    providers?: Record<string, { label: string; connected: boolean }>;
    chatVersion: number;
    onSaved?: () => void;
}) {
    const [saved, setSaved] = useState<Smart>();
    const [pending, setPending] = useState('loading'),
        [error, setError] = useState(''),
        [message, setMessage] = useState(''),
        [typing, setTyping] = useState(false);
    async function load() {
        setPending('loading');
        setError('');
        try {
            setSaved(await api('/api/settings/smart'));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPending('');
        }
    }
    useEffect(() => {
        void load();
    }, [chatVersion]);
    async function save(change: Change, note = '') {
        if (!saved || pending) return;
        setPending('saving');
        setError('');
        setMessage('');
        try {
            setSaved(await api('/api/settings/smart', change));
            onSaved?.();
            setMessage(`Smart settings saved.${note}`);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPending('');
        }
    }
    const available = (models ?? []).filter((m) => providers?.[m.provider]?.connected);
    const r = saved?.resolved;
    const selected =
        r &&
        available.find(
            (m) => m.provider === r.provider && (r.model ? m.model === r.model : m.isDefault),
        );
    const unavailable = !!r?.provider && !!models && !selected;
    const incompatible = !!r?.effort && !!selected && !effortSupported(r.effort, selected);
    const followLabel = selected
        ? selected.label
        : r && !r.provider
          ? 'Not set'
          : r
            ? `${providers?.[r.provider]?.label ?? r.provider} · ${r.model ?? 'default model'}`
            : '';
    return (
        <>
            <div role="row" className="settings-roles__row">
                <div role="rowheader" className="settings-roles__role">
                    <b>Smart</b>
                    <small>Writes visuals and plans videos</small>
                </div>
                <div role="cell">
                    <ModelPicker
                        label="Smart model"
                        isUnavailable={unavailable}
                        value={saved?.model ? key(saved.model) : 'follow'}
                        isDisabled={!saved || !!pending}
                        options={[
                            {
                                value: 'follow',
                                label:
                                    saved && !saved.model
                                        ? `Follow chat default (${followLabel})`
                                        : 'Follow chat default',
                            },
                            ...(saved?.model && unavailable
                                ? [
                                      {
                                          value: key(saved.model),
                                          label: `${providers?.[saved.model.provider]?.label ?? saved.model.provider} · ${saved.model.model} (unavailable)`,
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
                            if (!saved) return;
                            const model =
                                value === 'follow' ? null : available.find((m) => key(m) === value);
                            if (model === undefined) return;
                            // A pinned effort the new model lacks resets to Provider default rather than being sent unsupported.
                            const reset =
                                !saved.followEffort &&
                                !!saved.effort &&
                                !!model &&
                                !(model.efforts ?? []).includes(saved.effort);
                            void save(
                                reset
                                    ? {
                                          model: model && {
                                              provider: model.provider,
                                              model: model.model,
                                          },
                                          followEffort: false,
                                          effort: null,
                                      }
                                    : {
                                          model: model && {
                                              provider: model.provider,
                                              model: model.model,
                                          },
                                      },
                                reset
                                    ? ' Smart effort changed to Provider default for this model.'
                                    : '',
                            );
                        }}
                    />
                </div>
                <div role="cell">
                    <Selector
                        label="Smart effort"
                        isLabelHidden
                        status={incompatible ? { type: 'error' } : undefined}
                        value={
                            !saved || saved.followEffort ? 'follow' : (saved.effort ?? 'default')
                        }
                        size="sm"
                        width="100%"
                        isDisabled={!saved || !!pending || !selected}
                        options={[
                            {
                                value: 'follow',
                                label: saved?.followEffort
                                    ? `Follow chat default (${effortLabel(r?.effort ?? null)})`
                                    : 'Follow chat default',
                            },
                            ...effortOptions(
                                saved && !saved.followEffort && selected ? saved.effort : null,
                                selected,
                            ),
                        ]}
                        onChange={(value) =>
                            value === CUSTOM_EFFORT
                                ? setTyping(true)
                                : void save(
                                      value === 'follow'
                                          ? { followEffort: true }
                                          : {
                                                followEffort: false,
                                                effort: value === 'default' ? null : value,
                                            },
                                  )
                        }
                    />
                    {typing && selected && (
                        <CustomEffort
                            label="Custom smart effort"
                            onCancel={() => setTyping(false)}
                            onSave={(effort) => {
                                setTyping(false);
                                void save({ followEffort: false, effort });
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
                                ? 'Smart model unavailable. Check Connections, refresh models, or choose another model.'
                                : `${followLabel} does not support ${effortLabel(r!.effort)} effort. Choose a listed smart effort or Provider default.`}{' '}
                            Smart work will not switch providers or invent an effort.
                        </Text>
                    )}
                    <Text type="supporting" role="status">
                        {pending === 'loading'
                            ? 'Loading smart settings…'
                            : pending === 'saving'
                              ? 'Saving smart settings…'
                              : message}
                    </Text>
                    {error && (
                        <Text type="supporting" role="alert">
                            {error}
                        </Text>
                    )}
                    {!saved && !pending && (
                        <Button
                            label="Retry loading smart settings"
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

type VideoModeValue = 'quality' | 'saving';

// How much smart model work a video gets; app-wide, read when a video starts or is retried.
export function VideoMode() {
    const [mode, setMode] = useState<VideoModeValue>(),
        [pending, setPending] = useState(false),
        [error, setError] = useState('');
    useEffect(() => {
        api('/api/settings/video-mode').then(
            (s) => setMode(s.mode),
            (e) => setError((e as Error).message),
        );
    }, []);
    async function save(next: VideoModeValue) {
        setPending(true);
        setError('');
        try {
            setMode((await api('/api/settings/video-mode', { mode: next })).mode);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPending(false);
        }
    }
    return (
        <VStack gap={2}>
            <Selector
                label="Video mode"
                value={mode ?? 'quality'}
                isDisabled={mode === undefined || pending}
                options={[
                    { value: 'quality', label: 'Quality' },
                    { value: 'saving', label: 'Saving' },
                ]}
                onChange={(value) => void save(value as VideoModeValue)}
                description="Saving skips cut audits, piece improvements and reference photos to spend fewer tokens. Applies to every profile, from the next video or Retry."
            />
            {error && (
                <Text type="supporting" role="alert">
                    {error}
                </Text>
            )}
        </VStack>
    );
}
