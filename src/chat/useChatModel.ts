import { useEffect, useRef, useState } from 'react';
import { effortSupported, effortWasReset, type Model } from '../settings/models';
import type { ModelSelection, Providers } from './types';
import type { ChatState } from './useChatState';

// Chat model choice: the model list, the composer's menu and the saved selection per conversation.
export function useChatModel(c: ChatState) {
    const { state, tree, setTree, selected, setError, api } = c;
    const [firstModel, setFirstModel] = useState<ModelSelection>();
    const [models, setModels] = useState<Model[]>();
    const [providers, setProviders] = useState<Providers>();
    const [modelError, setModelError] = useState('');
    const [modelNotice, setModelNotice] = useState('');
    const [savingModel, setSavingModel] = useState<string>();
    const [modelMenuOpen, setModelMenuOpen] = useState(false),
        [openingModels, setOpeningModels] = useState(false);
    const [profileSwitch, setProfileSwitch] = useState<ModelSelection & { id: string }>();
    const modelRequest = useRef(0);
    async function loadModels() {
        const version = ++modelRequest.current;
        setModelError('');
        try {
            const data = await api('/api/models');
            if (version === modelRequest.current) {
                setModels(data.models);
                setProviders(data.providers);
            }
        } catch (e) {
            if (version === modelRequest.current) {
                setModelError((e as Error).message);
                setProviders((e as { data?: { providers?: Providers } }).data?.providers);
            }
        }
    }
    useEffect(() => {
        if (state) void loadModels();
    }, [!!state, state?.auth.connected]);
    useEffect(() => {
        if (!state || tree || selected.current || c.tab === 'settings') return;
        let canceled = false;
        void api('/api/settings/chat')
            .then((value) => {
                if (!canceled) setFirstModel(value);
            })
            .catch((e) => {
                if (!canceled) setError(e.message);
            });
        return () => {
            canceled = true;
        };
    }, [!!state, !tree && !selected.current, c.tab === 'settings']);
    async function openModels(open: boolean) {
        if (!open) {
            setModelMenuOpen(false);
            return;
        }
        if (openingModels) return;
        const id = selected.current;
        setOpeningModels(true);
        await loadModels();
        setOpeningModels(false);
        if (selected.current === id) setModelMenuOpen(true);
    }
    async function changeModel(provider: string, model: string | null, effort: string | null) {
        if (!tree || savingModel) return;
        const id = tree.id;
        setSavingModel(id);
        setError('');
        setModelNotice('');
        try {
            const saved = await api(`/api/trees/${id}/model`, { provider, model, effort });
            ++c.checkpoints.current;
            setTree((t) =>
                t?.id === id
                    ? { ...t, provider: saved.provider, model: saved.model, effort: saved.effort }
                    : t,
            );
            if (selected.current === id && effortWasReset(tree, { provider, model, effort }))
                setModelNotice('Effort changed to Provider default for this model.');
        } catch (e) {
            if (selected.current === id) setError((e as Error).message);
        } finally {
            setSavingModel(undefined);
        }
    }
    useEffect(() => {
        setModelNotice('');
    }, [tree?.id]);
    // A profile switch reaches the conversation open at the time; a streaming reply finishes on its old model first.
    const profileActivated = (chat: ModelSelection) =>
        setProfileSwitch(tree ? { ...chat, id: tree.id } : undefined);
    const streaming = !!tree && !!state?.active.includes(tree.id);
    useEffect(() => {
        if (!profileSwitch) return;
        // shortcut: leaving the conversation before its reply ends drops the switch; apply by id if that matters.
        if (tree?.id !== profileSwitch.id) return setProfileSwitch(undefined);
        if (streaming || savingModel) return;
        setProfileSwitch(undefined);
        void changeModel(profileSwitch.provider, profileSwitch.model, profileSwitch.effort);
    }, [profileSwitch, tree?.id, streaming, savingModel]);
    async function signIn() {
        const result = await api('/api/auth', {});
        window.location.assign(result.url);
    }

    const providerLabel = (id: string) => providers?.[id]?.label ?? id;
    const codexFallback = models?.find((m) => m.provider === 'codex' && m.defaultFallback);
    const composition = tree ?? firstModel;
    const currentModel =
        composition &&
        models?.find(
            (m) =>
                m.provider === composition.provider &&
                (composition.model ? m.model === composition.model : m.isDefault),
        );
    const unavailableSelection =
        !!tree &&
        !!models &&
        (!providers?.[tree.provider]?.connected ||
            !currentModel ||
            !effortSupported(tree.effort, currentModel));
    const modelLabel = (t: ModelSelection) => {
        if (!t.provider) return 'Not set';
        const label =
            models?.find((m) => m.provider === t.provider && m.model === t.model)?.label ??
            t.model ??
            models?.find((m) => m.provider === t.provider && m.isDefault)?.label ??
            'default model';
        return label.startsWith(providerLabel(t.provider))
            ? label
            : `${providerLabel(t.provider)} · ${label}`;
    };
    const chooseModel = (provider: string, model: string, effort: string | null) =>
        tree ? changeModel(provider, model, effort) : setFirstModel({ provider, model, effort });
    return {
        firstModel,
        models,
        providers,
        modelError,
        modelNotice,
        savingModel,
        modelMenuOpen,
        openingModels,
        loadModels,
        openModels,
        chooseModel,
        profileActivated,
        signIn,
        codexFallback,
        composition,
        currentModel,
        unavailableSelection,
        modelLabel,
    };
}

export type ChatModel = ReturnType<typeof useChatModel>;
