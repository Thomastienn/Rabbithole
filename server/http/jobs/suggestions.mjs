import { knownConcepts, suggest } from '../../suggestions.mjs';

// One quick thinking call after a completed reply (ADR 0016): the hidden notes for the tutor's marks, or every note for a reply that never ended. Detached from the reply stream so chat stays usable; stop() leaves the row pending and the next start marks it failed.
export function suggestionJobs(ctx) {
    const { store, pick, suggesting } = ctx;
    // marked: the tutor's saved passages and groundwork, so the call only names concepts and writes the graph.
    const startSuggestions = (conversation, message, question, answer, marked = null) => {
        const settings = store.suggestionSettings();
        if (!ctx.suggestions || !settings.enabled) return;
        if (!marked && !store.pendingSuggestions(conversation, message)) return;
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
            const text = [tree.branch?.text, question, answer].filter(Boolean).join('\n');
            const familiarity = store.mentioned(text);
            // Only the reply's concept neighbourhood is sent for matching, under every known topic.
            const { concepts } = await ctx.neighbourhood(text, running.controller.signal);
            const known = knownConcepts({ topics: store.graph().topics, concepts });
            const selection = settings.model
                ? { ...settings.model, effort: settings.effort }
                : tree;
            const result = await suggest(
                ctx.logged(pick(selection), 'suggestions', message, selection),
                selection,
                { inheritedContext, question, answer, knownConcepts: known, familiarity },
                running.controller.signal,
                ctx.suggestionTimeout,
                settings.model?.model,
                {
                    capable: await ctx.toolCapable(selection).catch(() => false),
                    mcp: ctx.mcp,
                    marked,
                },
            );
            store.addGraph(result.graph, message);
            if (marked)
                return store.nameSuggestions(
                    conversation,
                    message,
                    result.passages,
                    result.usage,
                    selection,
                );
            if (result.questions.length) store.nextQuestions(message, result.questions);
            store.finishSuggestions(
                conversation,
                message,
                result.passages,
                result.usage,
                selection,
                result.groundwork,
            );
        })()
            .catch((error) => {
                if (!ctx.stopping && !marked)
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
    // The tutor's marks are ready once the reply ends; a stopped reply keeps the marks that arrived.
    const noteSuggestions = (conversation, message, status, notes, question, answer) => {
        if (!answer.trim() || !store.tree(conversation) || !store.suggestionSettings().enabled)
            return;
        const marked =
            notes.ended ||
            (status === 'interrupted' && (notes.passages.length || notes.groundwork.length));
        if (marked) {
            if (!store.pendingSuggestions(conversation, message)) return;
            const { passages, groundwork } = notes;
            store.finishSuggestions(conversation, message, passages, null, null, groundwork);
            if (status === 'completed')
                startSuggestions(conversation, message, question, answer, notes);
        } else if (status === 'completed')
            startSuggestions(conversation, message, question, answer);
    };
    return { noteSuggestions };
}
