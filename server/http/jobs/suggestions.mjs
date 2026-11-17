import { knownConcepts, marks, nameTokens, suggest } from '../../suggestions.mjs';

// Fallback for a reply without a readable notes block. Detached from the reply stream so chat stays usable; stop() leaves the row pending and the next start marks it failed.
export function suggestionJobs(ctx) {
  const { store, pick, suggesting } = ctx;
  const startSuggestions = (conversation, message, question, answer) => {
    const settings = store.suggestionSettings();
    if (!ctx.suggestions || !settings.enabled) return;
    const known = knownConcepts(store.graph());
    if (!store.pendingSuggestions(conversation, message, nameTokens(known))) return;
    const tree = store.tree(conversation),
      running = { controller: new AbortController(), conversation };
    suggesting.set(message, running);
    running.done = (async () => {
      const inheritedContext = tree.branch
        ? {
            snapshot: tree.branch.snapshot,
            selectedPassage: tree.branch.text,
            question: tree.branch.question,
          }
        : null;
      const familiarity = store.mentioned(
        [tree.branch?.text, question, answer].filter(Boolean).join('\n'),
      );
      const selection = settings.model ? { ...settings.model, effort: settings.effort } : tree;
      const result = await suggest(
        ctx.logged(pick(selection), 'suggestions', message, selection),
        selection,
        { inheritedContext, question, answer, knownConcepts: known, familiarity },
        running.controller.signal,
        ctx.suggestionTimeout,
        settings.model?.model,
      );
      store.addGraph(result.graph, message);
      store.finishSuggestions(conversation, message, result.passages, result.usage, selection);
    })()
      .catch((error) => {
        if (!ctx.stopping)
          store.finishSuggestions(
            conversation,
            message,
            null,
            error.usage ?? null,
            settings.model ?? tree,
          );
      })
      .catch(() => {})
      .finally(() => suggesting.delete(message));
  };
  // The tutor's notes block feeds the same store calls; only a completed reply without a readable block calls quick thinking.
  const noteSuggestions = (conversation, message, status, notes, question, answer) => {
    if (!answer.trim() || !store.tree(conversation) || !store.suggestionSettings().enabled) return;
    if (notes?.readable || (notes && status === 'interrupted')) {
      if (!store.pendingSuggestions(conversation, message)) return;
      const { passages, graph } = marks(notes, answer);
      store.addGraph(graph, message);
      store.finishSuggestions(conversation, message, passages, null, null);
    } else if (status === 'completed') startSuggestions(conversation, message, question, answer);
  };
  return { noteSuggestions };
}
