import { loggedProvider } from '../log.mjs';
import { quickDefault } from '../suggestions.mjs';

export const LABELS = { claude: 'Claude', codex: 'Codex', openai: 'Custom endpoint' };

// Each saved custom endpoint is its own provider: openai (migrated) or openai:<id>.
export const isEndpoint = (id) => typeof id === 'string' && /^openai(:|$)/.test(id);

// Model role resolution and metering over the live provider map.
export function roles({ store, providers, endpoint, defaultProvider, log }) {
  const syncEndpoints = () => {
    if (!endpoint) return;
    for (const id of Object.keys(providers)) if (isEndpoint(id)) delete providers[id];
    Object.assign(providers, endpoint.providers());
  };
  const pick = (tree) => {
    if (!Object.hasOwn(providers, tree.provider))
      throw new Error(
        'Selected provider is unavailable. Configure it in settings or choose another provider.',
      );
    return providers[tree.provider];
  };
  const selectionError = async ({ provider, model, effort }) => {
    if (typeof provider !== 'string' || !Object.hasOwn(providers, provider))
      return {
        status: 400,
        error:
          'Selected provider is unavailable. Configure it in Connections or choose another provider.',
      };
    try {
      const selected = (await providers[provider].models()).find((m) => m.model === model);
      if (typeof model !== 'string' || !selected)
        return {
          status: 400,
          error: 'Selected model is unavailable. Refresh models and choose again.',
        };
      if (
        effort !== null &&
        (typeof effort !== 'string' || !(selected.efforts ?? []).includes(effort))
      )
        return {
          status: 400,
          error:
            'This model does not support the selected effort. Choose a listed effort or Provider default.',
        };
    } catch {
      const next = isEndpoint(provider)
        ? 'Check custom endpoint settings in Connections.'
        : `Sign in to ${LABELS[provider] ?? 'the provider'} in Connections.`;
      return {
        status: 502,
        error: `Could not check the selected model. ${next} Then refresh models and retry. Your previous selection is saved.`,
      };
    }
  };
  const chatDefault = () =>
    store.chatSettings() ?? { provider: defaultProvider, model: null, effort: null };
  // Smart follows the global chat default per field, never a conversation override.
  const smart = () => {
    const saved = store.smartSettings(),
      chat = chatDefault();
    return {
      ...saved,
      resolved: {
        provider: saved.model?.provider ?? chat.provider,
        model: saved.model ? saved.model.model : chat.model,
        effort: saved.followEffort ? chat.effort : saved.effort,
      },
    };
  };
  // The chat role falls back to the default provider exactly as chatDefault does.
  const profiles = () => {
    const list = store.profiles();
    return {
      ...list,
      profiles: list.profiles.map((p) => ({
        ...p,
        chat: p.chat ?? { provider: defaultProvider, model: null, effort: null },
      })),
    };
  };
  // Accounting boundary for background work: each logical call records once under its own id, with any reported
  // counts even when it fails or stops; an unreported call stays unavailable. Rendering and TTS never pass through here.
  const logged = (provider, task, id, selection, detail) =>
    loggedProvider(log, provider, task, id, selection, detail);
  const metered = (provider, task, id, selection, detail) => ({
    generate: async (tree, text, emit, saveThread, signal) => {
      let usage = null,
        model = selection.model;
      try {
        return await logged(provider, task, id, selection, detail).generate(
          tree,
          text,
          (event) => {
            if (event.type === 'usage') usage = event.usage;
            emit(event);
          },
          (thread, actual) => {
            model = actual ?? model;
            saveThread(thread, actual);
          },
          signal,
        );
      } finally {
        store.record(`${task}:${id}`, task, { provider: selection.provider, model }, usage);
      }
    },
  });
  // Quick thinking compacts in an isolated call: its own model and effort, no thread, and never the new question.
  const quickFor = async (parent) => {
    const saved = store.suggestionSettings();
    let quick;
    try {
      quick = saved.model
        ? { ...saved.model, effort: saved.effort }
        : {
            provider: parent.provider,
            model: quickDefault(parent, (await pick(parent).models?.()) ?? []),
            effort: null,
          };
    } catch (error) {
      return {
        status: 502,
        error: `Quick thinking cannot prepare this chat's context. ${error.message} Retry, or choose another quick thinking model in Settings.`,
      };
    }
    if (saved.model) {
      const invalid = await selectionError(quick);
      if (invalid)
        return {
          status: invalid.status,
          error: `Quick thinking cannot prepare this chat's context. ${invalid.error}`,
        };
    }
    return { quick };
  };
  return {
    syncEndpoints,
    pick,
    selectionError,
    chatDefault,
    smart,
    profiles,
    logged,
    metered,
    quickFor,
  };
}
