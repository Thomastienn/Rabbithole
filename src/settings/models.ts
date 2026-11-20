export type Model = {
    provider: string;
    model: string;
    label: string;
    isDefault?: boolean;
    defaultFallback?: boolean;
    efforts?: string[];
    defaultEffort?: string;
    readsImages?: boolean;
    usesTutorTools?: boolean;
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
                      : {
                            value: effort,
                            label: `${effortLabel(effort)} (unavailable)`,
                            disabled: true,
                        },
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
            value: current
                ? (selection.model ?? listed.find((m) => m.isDefault)?.model)
                : undefined,
            items:
                p.connected && listed.length
                    ? [
                          ...(current &&
                          selection.model &&
                          !listed.some((m) => m.model === selection.model)
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
// Rows a model picker draws at once; a search narrows catalogues of thousands.
export const SHOWN_MODELS = 50;
// Fuzzy subsequence score, lower is better, or null when the query is not a subsequence.
// Fewer breaks between matched runs rank first, then an earlier start, then shorter text.
export function fuzzyScore(query: string, text: string) {
    const t = text.toLowerCase();
    let best: number | null = null;
    for (let start = t.indexOf(query[0]); start >= 0; start = t.indexOf(query[0], start + 1)) {
        let at = start,
            breaks = 0;
        for (let i = 1; i < query.length && at >= 0; i++) {
            const next = t.indexOf(query[i], at + 1);
            if (next > at + 1) breaks++;
            at = next;
        }
        if (at < 0) break;
        const score = breaks * 1e6 + Math.min(start, 999) * 1e3 + Math.min(t.length, 999);
        if (best === null || score < best) best = score;
    }
    return best;
}
// The shared model search: best matches on label or id first, capped at SHOWN_MODELS.
// An empty query keeps the given order. Returns the shown items and how many matched.
export function searchModels<T extends { label: string; value: string }>(
    items: T[],
    query: string,
) {
    const q = query.toLowerCase().replace(/\s+/g, '');
    if (!q) return { shown: items.slice(0, SHOWN_MODELS), found: items.length };
    const ranked = items
        .map((item) => {
            const a = fuzzyScore(q, item.label),
                b = fuzzyScore(q, item.value);
            return { item, score: a === null ? b : b === null ? a : Math.min(a, b) };
        })
        .filter((r): r is { item: T; score: number } => r.score !== null)
        .sort((a, b) => a.score - b.score);
    return { shown: ranked.slice(0, SHOWN_MODELS).map((r) => r.item), found: ranked.length };
}
// The search over grouped lists (one per provider): each group keeps its shown items in rank order.
export function searchGroups<T extends { label: string; value: string }>(
    groups: T[][],
    query: string,
) {
    const { shown, found } = searchModels(groups.flat(), query);
    return { groups: groups.map((g) => shown.filter((i) => g.includes(i))), shown, found };
}
