import { loggedProvider } from '../log.mjs';
import { quickDefault } from '../suggestions.mjs';

export const LABELS = { claude: 'Claude', codex: 'Codex', openai: 'Custom endpoint' };

// Each saved custom endpoint is its own provider: openai (migrated) or openai:<id>.
export const isEndpoint = (id) => typeof id === 'string' && /^openai(:|$)/.test(id);
// Custom endpoint models also accept a learner-typed effort, sent unchanged as reasoning_effort.
export const TYPED_EFFORT = /^[A-Za-z0-9_-]{1,32}$/;

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
      const typed = isEndpoint(provider) && typeof effort === 'string' && TYPED_EFFORT.test(effort);
      if (
        effort !== null &&
        !typed &&
        (typeof effort !== 'string' || !(selected.efforts ?? []).includes(effort))
      )
        return {
          status: 400,
          error:
            'This model does not support the selected effort. Choose a listed effort or Provider default.',
        };
      // Every save path validates here, so a typed effort is remembered for this endpoint model.
      if (typed && !(selected.efforts ?? []).includes(effort))
        store.rememberEffort(provider, model, effort);
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
  // Reads images: the learner's override, else the endpoint-reported vision, else the old endpoint flag; Claude and Codex say for themselves.
  const imageReading = (provider, m) =>
    isEndpoint(provider)
      ? (store.readsImagesOverride(provider, m.model) ??
        m.vision ??
        !!providers[provider]?.acceptsImages)
      : !!providers[provider]?.readsImages;
  const usesTutorTools = (provider, m) =>
    isEndpoint(provider)
      ? (store.usesTutorToolsOverride(provider, m.model) ?? m.tools ?? false)
      : provider === 'claude' || provider === 'codex';
  // Remembered typed efforts follow the endpoint's advertised ones in its model list; every model says whether it reads images.
  const withTyped = (provider, list) =>
    list.map((m) => ({
      ...m,
      readsImages: imageReading(provider, m),
      usesTutorTools: usesTutorTools(provider, m),
      ...(isEndpoint(provider) && {
        efforts: [...new Set([...(m.efforts ?? []), ...store.typedEfforts(provider, m.model)])],
      }),
    }));
  // A send's attachments follow its model; an unlistable endpoint falls back to the saved choices for that model.
  const listed = async (provider, model) => {
    const list = (await providers[provider]?.models().catch(() => [])) ?? [];
    return list.find((m) => (model == null ? m.isDefault : m.model === model)) ?? { model };
  };
  const readsImages = async ({ provider, model }) =>
    isEndpoint(provider)
      ? imageReading(provider, await listed(provider, model))
      : imageReading(provider);
  // Tutor tools: override, else the reported capability, else off for custom endpoint models.
  const toolCapable = async ({ provider, model }) =>
    usesTutorTools(provider, isEndpoint(provider) ? await listed(provider, model) : {});
  // A null default provider (fresh install) leaves an unset chat role without a provider.
  const unset = () => ({ provider: defaultProvider, model: null, effort: null });
  const chatDefault = () => store.chatSettings() ?? unset();
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
        chat: p.chat ?? unset(),
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
      const record = () =>
        store.record(
          `${task}:${id}`,
          task,
          { provider: selection.provider, model },
          usage,
          undefined,
          detail?.message,
        );
      record();
      try {
        return await logged(provider, task, id, selection, detail).generate(
          tree,
          text,
          (event) => {
            if (event.type === 'usage') {
              usage = event.usage;
              record();
            }
            emit(event);
          },
          (thread, actual) => {
            model = actual ?? model;
            saveThread(thread, actual);
          },
          signal,
        );
      } finally {
        record();
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
    withTyped,
    readsImages,
    toolCapable,
    chatDefault,
    smart,
    profiles,
    logged,
    metered,
    quickFor,
  };
}
