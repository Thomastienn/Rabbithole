export type Model = {
  provider: string;
  model: string;
  label: string;
  isDefault?: boolean;
  defaultFallback?: boolean;
  efforts?: string[];
  defaultEffort?: string;
  readsImages?: boolean;
};
export type ChatSelection = { provider: string; model: string | null; effort: string | null };
export const effortLabel = (effort: string | null) =>
  effort === null
    ? 'Provider default'
    : effort === 'xhigh'
      ? 'Extra high'
      : effort[0].toUpperCase() + effort.slice(1);
// A chosen effort carries to another model only when that model offers it.
export const keptEffort = (effort: string | null, model?: Pick<Model, 'efforts'>) =>
  effort && model?.efforts?.includes(effort) ? effort : null;
export const isCustomEndpoint = (provider?: string | null) => /^openai(:|$)/.test(provider ?? '');
// Picker value for "Custom…"; the ellipsis can never be part of a typed effort.
export const CUSTOM_EFFORT = 'custom…';
// A typed effort is trimmed and limited to 1-32 letters, digits, - or _; picker values stay reserved.
export const typedEffort = (text: string) => {
  const effort = text.trim();
  return /^[A-Za-z0-9_-]{1,32}$/.test(effort) && !['default', 'follow'].includes(effort)
    ? effort
    : null;
};
// Custom endpoints accept any typed effort, so their saved effort is never flagged unsupported.
export const effortSupported = (
  effort: string | null,
  model: Pick<Model, 'provider' | 'efforts'>,
) => !effort || isCustomEndpoint(model.provider) || !!model.efforts?.includes(effort);
// Provider default, then a saved effort the model no longer offers (disabled), then the model's
// efforts; custom endpoint models keep a saved typed effort selectable and end with "Custom…".
export const effortOptions = (
  effort: string | null | undefined,
  model?: Pick<Model, 'provider' | 'efforts'>,
) => {
  const efforts = model?.efforts ?? [],
    custom = isCustomEndpoint(model?.provider);
  return [
    { value: 'default', label: 'Provider default' },
    ...(effort && !efforts.includes(effort)
      ? [
          custom
            ? { value: effort, label: effortLabel(effort) }
            : { value: effort, label: `${effortLabel(effort)} (unavailable)`, disabled: true },
        ]
      : []),
    ...efforts.map((value) => ({ value, label: effortLabel(value) })),
    ...(custom ? [{ value: CUSTOM_EFFORT, label: 'Custom…' }] : []),
  ];
};
// Switching to a model without the chosen effort resets it; the learner is told once.
export const effortWasReset = (before: ChatSelection, after: ChatSelection) =>
  !!before.effort &&
  after.effort === null &&
  (before.provider !== after.provider || before.model !== after.model);
// Model menu: one group per provider in catalogue order. Connected providers list their models
// (a saved model no longer listed stays as a disabled entry); others offer their repair action.
export const menuGroups = (
  providers: Record<string, { label: string; connected: boolean }>,
  models: Model[] | undefined,
  selection: ChatSelection,
) =>
  Object.entries(providers).map(([id, p]) => {
    const listed = (models ?? []).filter((m) => m.provider === id),
      current = selection.provider === id;
    return {
      id,
      label: p.label,
      title: p.connected ? p.label : `${p.label} · not connected`,
      value: current ? (selection.model ?? listed.find((m) => m.isDefault)?.model) : undefined,
      items:
        p.connected && listed.length
          ? [
              ...(current && selection.model && !listed.some((m) => m.model === selection.model)
                ? [
                    {
                      value: selection.model,
                      label: `${selection.model} (saved)`,
                      disabled: true,
                      readsImages: false,
                    },
                  ]
                : []),
              ...listed.map((m) => ({
                value: m.model,
                label: m.label,
                disabled: false,
                readsImages: !!m.readsImages,
              })),
            ]
          : null,
      action: isCustomEndpoint(id) ? 'endpoint' : id === 'codex' ? 'codex' : 'check',
    };
  });
