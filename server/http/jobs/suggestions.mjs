import { knownConcepts, suggest } from '../../suggestions.mjs';
import { applyMemoryEdit } from '../../tools/memoryNote.mjs';
import { errorCause, formatLog } from '../../log.mjs';
import { confirmMerges, mergeCandidates } from '../../merges.mjs';

// One quick thinking call after a completed reply (ADR 0016): the hidden notes for the tutor's marks, or every note for a reply that never ended. Detached from the reply stream so chat stays usable; stop() leaves the row pending and the next start marks it failed.
export function suggestionJobs(ctx) {
    const { store, pick } = ctx;
    // Automatic merge (ADR 0022) after the row settles, so suggestions never wait on it; any failure merges nothing.
    const merge = async (added, { message, conversation, selection, quick, capable, signal }) => {
        if (!ctx.videoEmbed) return;
        const fields = { id: message, conversation, task: 'merge' };
        try {
            const pairs = await mergeCandidates(store, ctx.videoEmbed, added, signal);
            if (!pairs.length) return;
            const confirmed = await confirmMerges(
                ctx.metered(pick(selection), 'merge', message, selection, { message }),
                quick,
                pairs,
                // Bounded like the suggestions call, so a hung provider cannot hold the job open.
                AbortSignal.any([signal, AbortSignal.timeout(ctx.suggestionTimeout ?? 120000)]),
                { capable, mcp: ctx.mcp },
            );
            for (const { kind, names } of confirmed) {
                const merged = store.mergeDuplicate(kind, ...names);
                if (merged)
                    ctx.log(
                        formatLog('info', 'suggestions', `${kind} merged`, {
                            ...fields,
                            names: names.join(', '),
                            kept: merged.kept,
                        }),
                    );
            }
        } catch (error) {
            if (!ctx.stopping && !signal.aborted)
                ctx.log(
                    formatLog('warn', 'suggestions', 'merge skipped', {
                        ...fields,
                        cause: errorCause(error, []),
                    }),
                );
        }
    };
    // marked: the tutor's saved passages and groundwork, so the call only names concepts and writes the graph.
    const startSuggestions = (conversation, message, question, answer, marked = null) => {
        const settings = store.suggestionSettings();
        if (!ctx.suggestions || !settings.enabled) return;
        if (!marked && !store.pendingSuggestions(conversation, message)) return;
        const tree = store.tree(conversation);
        ctx.jobs.start('suggestion', message, conversation, (running) =>
            (async () => {
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
                // Without a quick thinking model the cheap default needs a subscription conversation; a pinned model may be any connected provider.
                if (!settings.model && !['claude', 'codex'].includes(tree.provider))
                    throw new Error('Suggestions require a signed-in subscription provider.');
                const quick = await ctx.quickModel(tree, true),
                    capable = await ctx.toolCapable(selection).catch(() => false);
                const result = await suggest(
                    ctx.logged(pick(selection), 'suggestions', message, selection),
                    quick,
                    {
                        inheritedContext,
                        question,
                        answer,
                        knownConcepts: known,
                        familiarity,
                        memoryNote: store.memoryNote(),
                    },
                    running.controller.signal,
                    ctx.suggestionTimeout,
                    {
                        capable,
                        mcp: ctx.mcp,
                        marked,
                    },
                );
                const added = store.addGraph(result.graph, message);
                // Before the row settles, so the poll that sees the suggestions also sees the mark.
                for (const edit of result.memory) {
                    const fields = { id: message, conversation, task: 'memory' };
                    try {
                        applyMemoryEdit(store, edit, message);
                        ctx.log(formatLog('info', 'suggestions', 'memory edit', fields));
                    } catch (error) {
                        ctx.log(
                            formatLog('warn', 'suggestions', 'memory edit refused', {
                                ...fields,
                                cause: error.message,
                            }),
                        );
                    }
                }
                if (marked)
                    store.nameSuggestions(
                        conversation,
                        message,
                        result.passages,
                        result.usage,
                        selection,
                    );
                else {
                    if (result.questions.length) store.nextQuestions(message, result.questions);
                    store.finishSuggestions(
                        conversation,
                        message,
                        result.passages,
                        result.usage,
                        selection,
                        result.groundwork,
                    );
                    ctx.startBriefs(conversation, message);
                }
                await merge(added, {
                    message,
                    conversation,
                    selection,
                    quick,
                    capable,
                    signal: running.controller.signal,
                });
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
                .catch(() => {}),
        );
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
            if (status === 'completed') {
                ctx.startBriefs(conversation, message);
                startSuggestions(conversation, message, question, answer, notes);
            }
        } else if (status === 'completed')
            startSuggestions(conversation, message, question, answer);
    };
    return { noteSuggestions };
}
