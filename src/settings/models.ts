export type Model = {
  provider: string;
  model: string;
  label: string;
  isDefault?: boolean;
  defaultFallback?: boolean;
  efforts?: string[];
  defaultEffort?: string;
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
// Provider default, then a saved effort the model no longer offers (disabled), then the model's efforts.
export const effortOptions = (effort: string | null | undefined, efforts: string[] = []) => [
  { value: 'default', label: 'Provider default' },
  ...(effort && !efforts.includes(effort)
    ? [{ value: effort, label: `${effortLabel(effort)} (unavailable)`, disabled: true }]
    : []),
  ...efforts.map((value) => ({ value, label: effortLabel(value) })),
];
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
                ? [{ value: selection.model, label: `${selection.model} (saved)`, disabled: true }]
                : []),
              ...listed.map((m) => ({ value: m.model, label: m.label, disabled: false })),
            ]
          : null,
      action: /^openai(:|$)/.test(id) ? 'endpoint' : id === 'codex' ? 'codex' : 'check',
    };
  });
